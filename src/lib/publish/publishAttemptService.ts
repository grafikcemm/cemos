import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { assessQueueItemReadiness } from "@/lib/services/readinessAdapter";
import { READINESS_POLICY_VERSION } from "@/lib/services/readinessService";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { imageService } from "@/lib/services/imageService";
import { intentPublishAdapter } from "./intentAdapter";
import { PublishFlowError, type ReadinessSnapshot } from "./contract";

/**
 * Faz 1E (ADR-025) — publish state machine servisi. TEK yazım yolu:
 *  - prepareIntent  → PublishAttempt(prepared). PublishLog/PublishedPost YOK,
 *    QueueItem yayın durumu DEĞİŞMEZ. Yayın anında readiness YENİDEN koşar.
 *  - confirmManualPublish → prepared attempt'i tek transaction'da succeeded'a
 *    geçirir + QueueItem(manual_published) + PublishLog + PublishedPost +
 *    UsageLog. Tekrarlanan onay idempotent (yeni satır yazmaz).
 * Hiçbir route yayın durumunu doğrudan yazamaz — bu servisten geçer.
 */

type QueueItemWithAccount = NonNullable<
  Awaited<ReturnType<typeof prisma.queueItem.findUnique>>
> & {
  account: { id: string; handle: string; maxChars: number };
};

export function contentHashOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function currentText(item: { content: string; editedContent: string | null }): string {
  return (item.editedContent?.trim() || item.content.trim());
}

function idempotencyKeyFor(queueItemId: string, hash: string): string {
  // Aynı kullanıcı eyleminin retry'ı (aynı taslak + aynı metin) aynı anahtara
  // düşer → @@unique duplicate attempt'i engeller. Metin değişirse anahtar
  // değişir → yeni hazırlık, eskisi superseded.
  return `${queueItemId}:${hash.slice(0, 24)}`;
}

async function loadItem(queueItemId: string): Promise<QueueItemWithAccount> {
  const item = await prisma.queueItem.findUnique({
    where: { id: queueItemId },
    include: { account: true },
  });
  if (!item) throw new PublishFlowError("queue_item_not_found");
  return item as QueueItemWithAccount;
}

function assertReady(item: QueueItemWithAccount): ReadinessSnapshot {
  const readiness = assessQueueItemReadiness(item, item.account);
  const snapshot: ReadinessSnapshot = {
    state: readiness.state,
    reasons: readiness.reasons.map((r) => ({ code: r.code, message: r.message })),
    policyVersion: READINESS_POLICY_VERSION,
    assessedAt: new Date().toISOString(),
  };
  if (readiness.state !== "ready") {
    throw new PublishFlowError(
      readiness.state === "blocked" ? "readiness_blocked" : "edit_required",
      snapshot.reasons,
    );
  }
  return snapshot;
}

export const publishAttemptService = {
  contentHashOf,

  /**
   * "X'te aç" hazırlığı — server-side kalıcı PublishAttempt(prepared).
   * ready olmayan içerik HAZIRLANAMAZ; retry duplicate üretmez; içerik
   * değişince eski prepared attempt'ler superseded olur.
   */
  async prepareIntent(queueItemId: string) {
    const item = await loadItem(queueItemId);

    if (item.status === "published" || item.status === "manual_published") {
      throw new PublishFlowError("already_published");
    }
    if (item.status === "rejected") throw new PublishFlowError("invalid_status");

    const snapshot = assertReady(item);
    const text = currentText(item);
    const hash = contentHashOf(text);
    const idempotencyKey = idempotencyKeyFor(queueItemId, hash);

    const adapterRes = await intentPublishAdapter.prepare({
      queueItemId,
      accountId: item.accountId,
      accountHandle: item.account.handle,
      text,
      contentHash: hash,
      idempotencyKey,
      readinessSnapshot: snapshot,
    });
    if (!adapterRes.ok || !adapterRes.intentUrl) {
      throw new PublishFlowError(adapterRes.ok ? "conflict" : adapterRes.code);
    }
    const intentUrl = adapterRes.intentUrl;

    const uniqueWhere = {
      accountId_adapter_idempotencyKey: {
        accountId: item.accountId,
        adapter: "intent",
        idempotencyKey,
      },
    } as const;

    const existing = await prisma.publishAttempt.findUnique({ where: uniqueWhere });
    if (existing) {
      if (existing.state === "succeeded") throw new PublishFlowError("already_published");
      if (existing.state === "prepared") {
        // Aynı eylemin retry'ı — idempotent: mevcut hazırlığı dön.
        return { attempt: existing, intentUrl, reused: true };
      }
      // failed → aynı metinle yeniden hazırla (taze snapshot).
      const revived = await prisma.publishAttempt.update({
        where: { id: existing.id },
        data: {
          state: "prepared",
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          readinessPolicyVersion: snapshot.policyVersion,
          readinessSnapshotJson: JSON.stringify(snapshot),
        },
      });
      return { attempt: revived, intentUrl, reused: false };
    }

    try {
      const attempt = await prisma.$transaction(async (tx) => {
        // İçerik değişti → önceki prepared hazırlıklar stale: superseded kapat.
        await tx.publishAttempt.updateMany({
          where: { queueItemId, adapter: "intent", state: "prepared" },
          data: {
            state: "failed",
            errorCode: "superseded",
            errorMessage: "İçerik değişti — yeni hazırlık yapıldı.",
            completedAt: new Date(),
          },
        });
        return tx.publishAttempt.create({
          data: {
            queueItemId,
            accountId: item.accountId,
            adapter: "intent",
            state: "prepared",
            idempotencyKey,
            contentHash: hash,
            readinessPolicyVersion: snapshot.policyVersion,
            readinessSnapshotJson: JSON.stringify(snapshot),
          },
        });
      });
      return { attempt, intentUrl, reused: false };
    } catch (err) {
      // Paralel prepare yarışı: unique çakıştıysa kazananın satırını dön.
      const raced = await prisma.publishAttempt.findUnique({ where: uniqueWhere });
      if (raced && raced.state === "prepared") return { attempt: raced, intentUrl, reused: true };
      throw err;
    }
  },

  /**
   * "Paylaşıldı olarak işaretle" — atomik + idempotent manuel onay.
   * prepared intent attempt ŞART; contentHash güncel metinle eşleşmeli;
   * readiness yayın anında yeniden ready olmalı. Tüm yayın yazımları tek
   * transaction: attempt→succeeded, QueueItem→manual_published, PublishLog,
   * PublishedPost, UsageLog. Tekrarlanan onay mevcut başarıyı döner.
   */
  async confirmManualPublish(queueItemId: string, opts: { attemptId?: string } = {}) {
    const item = await loadItem(queueItemId);

    // İdempotent tekrar: zaten yayınlandıysa yeni satır YAZMADAN başarı dön.
    if (item.status === "published" || item.status === "manual_published") {
      const done = await prisma.publishAttempt.findFirst({
        where: { queueItemId, adapter: "intent", state: "succeeded" },
        orderBy: { createdAt: "desc" },
      });
      if (done) {
        return {
          alreadyPublished: true as const,
          attempt: done,
          item,
          log: null,
          generatedImageUrl: item.generatedImageUrl ?? null,
        };
      }
      throw new PublishFlowError("invalid_status");
    }
    if (item.status === "rejected") throw new PublishFlowError("invalid_status");

    const attempt = opts.attemptId
      ? await prisma.publishAttempt.findUnique({ where: { id: opts.attemptId } })
      : await prisma.publishAttempt.findFirst({
          where: { queueItemId, adapter: "intent", state: "prepared" },
          orderBy: { createdAt: "desc" },
        });
    if (!attempt) throw new PublishFlowError("prepare_not_found");
    if (attempt.queueItemId !== queueItemId || attempt.accountId !== item.accountId) {
      throw new PublishFlowError("account_mismatch");
    }
    if (attempt.adapter !== "intent") throw new PublishFlowError("adapter_mismatch");
    if (attempt.state === "succeeded") {
      return {
        alreadyPublished: true as const,
        attempt,
        item,
        log: null,
        generatedImageUrl: item.generatedImageUrl ?? null,
      };
    }
    if (attempt.state !== "prepared") throw new PublishFlowError("prepare_stale");

    const original = item.content.trim();
    const edited = item.editedContent?.trim() ?? "";
    const text = edited || original;
    if (contentHashOf(text) !== attempt.contentHash) {
      throw new PublishFlowError("content_changed");
    }

    // Yayın-anı readiness YENİDEN koşar (ADR-020) — snapshot eski kanıt,
    // güncel karar bu.
    assertReady(item);

    const wasEdited = edited.length > 0 && edited !== original;
    const now = new Date();

    let txResult: {
      updatedItem: Awaited<ReturnType<typeof prisma.queueItem.update>>;
      log: Awaited<ReturnType<typeof prisma.publishLog.create>>;
    };
    try {
      txResult = await prisma.$transaction(async (tx) => {
        // Optimistic claim: yalnız hâlâ prepared ise succeeded'a geçir —
        // eşzamanlı ikinci onay burada 0 satır günceller → conflict.
        const claimed = await tx.publishAttempt.updateMany({
          where: { id: attempt.id, state: "prepared" },
          data: { state: "succeeded", completedAt: now },
        });
        if (claimed.count === 0) throw new PublishFlowError("conflict");

        const updatedItem = await tx.queueItem.update({
          where: { id: queueItemId },
          data: { status: "manual_published", publishedAt: now, lastError: null },
        });
        const log = await tx.publishLog.create({
          data: {
            accountId: item.accountId,
            content: text,
            platform: "x",
            externalId: null,
            success: true,
            scheduledAt: item.scheduledAt,
            payload: JSON.stringify({ manualPublish: true, publishAttemptId: attempt.id }),
          },
        });
        await tx.publishedPost.create({
          data: {
            accountId: item.accountId,
            platform: "x",
            content: text,
            draftQueueItemId: queueItemId,
          },
        });
        await tx.usageLog.create({
          data: {
            accountId: item.accountId,
            type: "publish",
            tweetCount: 1,
            estimatedCostUsd: 0,
            date: now.toISOString().slice(0, 10),
          },
        });
        return { updatedItem, log };
      });
    } catch (err) {
      if (err instanceof PublishFlowError && err.code === "conflict") {
        // Yarışı kaybeden onay: kazanan zaten yayınladıysa idempotent başarı.
        const fresh = await prisma.publishAttempt.findUnique({ where: { id: attempt.id } });
        const freshItem = await prisma.queueItem.findUnique({ where: { id: queueItemId } });
        if (fresh?.state === "succeeded" && freshItem?.status === "manual_published") {
          return {
            alreadyPublished: true as const,
            attempt: fresh,
            item: freshItem,
            log: null,
            generatedImageUrl: freshItem.generatedImageUrl ?? null,
          };
        }
      }
      throw err;
    }

    // ── Transaction DIŞI, best-effort yan etkiler (öğrenme + görsel) — bunlar
    // yayın durumunun parçası değil; aksamaları başarılı yayını geri almaz. ──
    if (wasEdited) {
      await processFeedback({
        accountHandle: item.account.handle as "grafikcem" | "maskulenkod",
        accountId: item.accountId,
        feedbackType: "edited",
        originalContent: original,
        editedContent: edited,
        reason: "Manuel paylaşıldı (sabah akışı)",
        queueItemId,
        modeId: item.mode,
        saveTrainingExample: true,
        saveAsPattern: false,
      }).catch(() => {});
    }

    let generatedImageUrl: string | null = txResult.updatedItem.generatedImageUrl ?? null;
    if (item.account.handle === "maskulenkod" && !generatedImageUrl) {
      const img = await imageService.generateForQueueItem(queueItemId).catch(() => null);
      if (img?.generatedImageUrl) generatedImageUrl = img.generatedImageUrl;
    }

    return {
      alreadyPublished: false as const,
      attempt: { ...attempt, state: "succeeded" as const, completedAt: now },
      item: txResult.updatedItem,
      log: txResult.log,
      generatedImageUrl,
    };
  },

  /**
   * Daily-queue payload zenginleştirme: taslak başına en güncel intent
   * attempt'i + güncel metinle stale mi bilgisi. UI prepared durumunu buradan
   * (server kaynağından) besler — reload sonrası korunur.
   */
  async latestIntentAttempts(
    items: { id: string; content: string; editedContent: string | null }[],
  ): Promise<
    Map<
      string,
      { id: string; state: string; contentHash: string; createdAt: Date; staleForCurrentContent: boolean }
    >
  > {
    if (items.length === 0) return new Map();
    const rows = await prisma.publishAttempt.findMany({
      where: { queueItemId: { in: items.map((i) => i.id) }, adapter: "intent" },
      orderBy: { createdAt: "desc" },
    });
    const textById = new Map(items.map((i) => [i.id, currentText(i)]));
    const out = new Map<
      string,
      { id: string; state: string; contentHash: string; createdAt: Date; staleForCurrentContent: boolean }
    >();
    for (const row of rows) {
      if (out.has(row.queueItemId)) continue; // desc sıralı → ilk görülen en güncel
      const text = textById.get(row.queueItemId) ?? "";
      out.set(row.queueItemId, {
        id: row.id,
        state: row.state,
        contentHash: row.contentHash,
        createdAt: row.createdAt,
        staleForCurrentContent: contentHashOf(text) !== row.contentHash,
      });
    }
    return out;
  },
};
