import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { assessQueueItemReadiness } from "@/lib/services/readinessAdapter";
import { READINESS_POLICY_VERSION } from "@/lib/services/readinessService";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { imageService } from "@/lib/services/imageService";
import {
  isThreadDraft,
  joinThreadSegments,
  parseThreadSegments,
  threadPublicationHashInput,
  type ThreadSegment,
} from "@/lib/growth-engine/threadSegments";
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

export type PublicationItemLike = {
  content: string;
  editedContent: string | null;
  draftType: string;
  mode?: string | null;
  threadSegments: string | null;
};

export type CanonicalPublication = {
  /** thread_first_segment: X intent yalnız İLK segmenti açar (dürüst mod). */
  kind: "single" | "thread_first_segment";
  /** Yayının TAM metni (thread'de segmentlerin birleşimi). */
  text: string;
  /** Intent penceresine giden metin (thread'de yalnız ilk segment). */
  intentText: string;
  segments: ThreadSegment[] | null;
  /** Yayın gönderi sayısı — UsageLog.tweetCount bunu yansıtır (single=1). */
  segmentCount: number;
  /** contentHash: thread'de sıra+değer dahil segment hash'i; single'da düz
   *  metin hash'i (geriye uyumlu — non-thread davranış DEĞİŞMEDİ). */
  hash: string;
};

/**
 * Phase 2D (ADR-033): thread için canonical publication payload threadSegments'tir.
 * Hash segment SIRASI ve DEĞERLERİNİ kapsar — segment düzenlenince/yeniden
 * sıralanınca prepared attempt stale olur. Segmentsiz thread taslağı readiness'te
 * zaten yakalanır (structureless_thread → 422); burada single semantiğine düşer.
 */
export function canonicalPublicationOf(item: PublicationItemLike): CanonicalPublication {
  const segments = isThreadDraft(item.draftType, item.mode)
    ? parseThreadSegments(item.threadSegments)
    : null;
  if (segments && segments.length > 0) {
    const text = joinThreadSegments(segments);
    return {
      kind: "thread_first_segment",
      text,
      intentText: segments[0].text.trim(),
      segments,
      segmentCount: segments.length,
      hash: contentHashOf(threadPublicationHashInput(segments)),
    };
  }
  const text = currentText(item);
  return {
    kind: "single",
    text,
    intentText: text,
    segments: null,
    segmentCount: 1,
    hash: contentHashOf(text),
  };
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
    // Phase 2D: thread'de hash = canonical segment payload'ı; intent penceresi
    // yalnız İLK segmenti açar (X intent tek çağrıda zincir OLUŞTURMAZ — dürüst mod).
    const pub = canonicalPublicationOf(item);
    const hash = pub.hash;
    const idempotencyKey = idempotencyKeyFor(queueItemId, hash);

    const adapterRes = await intentPublishAdapter.prepare({
      queueItemId,
      accountId: item.accountId,
      accountHandle: item.account.handle,
      text: pub.intentText,
      contentHash: hash,
      idempotencyKey,
      readinessSnapshot: snapshot,
    });
    if (!adapterRes.ok || !adapterRes.intentUrl) {
      throw new PublishFlowError(adapterRes.ok ? "conflict" : adapterRes.code);
    }
    const intentUrl = adapterRes.intentUrl;
    const intentMode = pub.kind;
    const segmentCount = pub.segmentCount;

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
        return { attempt: existing, intentUrl, reused: true, intentMode, segmentCount };
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
      return { attempt: revived, intentUrl, reused: false, intentMode, segmentCount };
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
      return { attempt, intentUrl, reused: false, intentMode, segmentCount };
    } catch (err) {
      // Paralel prepare yarışı: unique çakıştıysa kazananın satırını dön.
      const raced = await prisma.publishAttempt.findUnique({ where: uniqueWhere });
      if (raced && raced.state === "prepared")
        return { attempt: raced, intentUrl, reused: true, intentMode, segmentCount };
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
    // Phase 2D: hash karşılaştırması canonical publication üzerinden — thread'de
    // segment sırası/değeri değiştiyse content_changed (yeniden "X'te aç").
    const pub = canonicalPublicationOf(item);
    const text = pub.text;
    if (pub.hash !== attempt.contentHash) {
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
            payload: JSON.stringify({
              manualPublish: true,
              publishAttemptId: attempt.id,
              // Phase 2D: thread onayı = BÜTÜN zincir için manuel kullanıcı beyanı.
              ...(pub.kind === "thread_first_segment"
                ? { manualThread: true, segmentCount: pub.segmentCount }
                : {}),
            }),
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
            // Phase 2D: thread onayı zincirdeki gönderi sayısını yansıtır.
            tweetCount: pub.segmentCount,
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
    items: ({ id: string } & PublicationItemLike)[],
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
    // Phase 2D: stale kararı canonical publication hash'i üzerinden — thread'de
    // segment düzenlemesi de prepared'ı stale yapar.
    const hashById = new Map(items.map((i) => [i.id, canonicalPublicationOf(i).hash]));
    const out = new Map<
      string,
      { id: string; state: string; contentHash: string; createdAt: Date; staleForCurrentContent: boolean }
    >();
    for (const row of rows) {
      if (out.has(row.queueItemId)) continue; // desc sıralı → ilk görülen en güncel
      const currentHash = hashById.get(row.queueItemId) ?? "";
      out.set(row.queueItemId, {
        id: row.id,
        state: row.state,
        contentHash: row.contentHash,
        createdAt: row.createdAt,
        staleForCurrentContent: currentHash !== row.contentHash,
      });
    }
    return out;
  },
};
