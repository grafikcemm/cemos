import { prisma } from "@/lib/db/client";
import { isWithinQuietHours } from "@/lib/services/scheduleService";
import { qualityLintService } from "@/lib/services/qualityLintService";
import { isNearDuplicate } from "@/lib/utils/textSimilarity";
import { imageService } from "@/lib/services/imageService";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { performanceRepo } from "@/lib/db/performanceRepo";
import { assessQueueItemReadiness } from "@/lib/services/readinessAdapter";

/** Yayın-anı readiness engeli — nedenleri taşır (route → 422 + Türkçe döküm). */
class ReadinessPublishError extends Error {
  reasons: { code: string; message: string }[];
  constructor(code: "readiness_blocked" | "edit_required", reasons: { code: string; message: string }[]) {
    super(code);
    this.reasons = reasons;
  }
}

function getDayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export const publishService = {
  async validatePublishable(
    queueItemId: string,
    opts: { overrideLint?: boolean; overrideQuietHours?: boolean; overrideDailyCap?: boolean } = {}
  ) {
    const item = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: { account: { include: { schedule: true } } },
    });

    if (!item) throw new Error("queue_item_not_found");

    if (item.status === "published" || item.status === "manual_published" || item.status === "rejected") {
      throw new Error("invalid_status");
    }

    const text = (item.editedContent?.trim() || item.content.trim());
    if (!text) throw new Error("empty_content");

    const maxChars = item.account.maxChars || 280;

    if (text.length > maxChars) throw new Error("char_limit");

    if (!opts.overrideLint) {
      const report = await qualityLintService.lint(text, item.draftType, maxChars, { forceDeterministicOnly: true });
      if (!report.passed) throw new Error("lint_blocked");
    }

    const schedule = item.account.schedule;
    if (schedule) {
      const now = new Date();

      if (!opts.overrideDailyCap) {
        const { start, end } = getDayBounds(now);
        const count = await prisma.publishLog.count({
          where: {
            accountId: item.accountId,
            success: true,
            publishedAt: { gte: start, lte: end },
            NOT: { payload: { contains: '"dryRun":true' } },
          },
        });
        if (count >= schedule.dailyMaxPosts) throw new Error("daily_cap_reached");
      }

      if (!opts.overrideQuietHours) {
        if (isWithinQuietHours(new Date(), schedule.quietStartHour, schedule.quietEndHour)) {
          throw new Error("quiet_hours_active");
        }
      }
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentLogs = await prisma.publishLog.findMany({
      where: {
        accountId: item.accountId,
        success: true,
        publishedAt: { gte: sevenDaysAgo },
        NOT: { payload: { contains: '"dryRun":true' } },
      },
    });
    for (const log of recentLogs) {
      if (isNearDuplicate(text, log.content)) throw new Error("duplicate_recent_post");
    }

    return { item, text };
  },

  // Mark as manually published — user copied tweet and posted it themselves
  async markManualPublished(queueItemId: string) {
    const item = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: { account: true },
    });
    if (!item) throw new Error("queue_item_not_found");
    if (item.status === "published" || item.status === "manual_published") {
      throw new Error("invalid_status");
    }

    // YAYIN-ANI READINESS (ADR-020 düzeltilmiş sözleşme). Kozmetik "AI çıktısını
    // mutlaka değiştir" (edited !== original) edit-gate'i KALKTI. İnsan onayı
    // kalite/policy kapısını SESSİZCE geçemez; taslak metni (editedContent ??
    // content) üzerinden readiness YENİDEN çalışır:
    //   blocked   → yayınlanamaz (route 422 + Türkçe nedenler)
    //   needs_edit→ "Düzenle" (yayın yok; kullanıcı metni düzenleyip ready yapar)
    //   ready     → yayınlanabilir (düzenleme ŞART değil).
    const readiness = assessQueueItemReadiness(item, item.account);
    if (readiness.state !== "ready") {
      throw new ReadinessPublishError(
        readiness.state === "blocked" ? "readiness_blocked" : "edit_required",
        readiness.reasons.map((r) => ({ code: r.code, message: r.message }))
      );
    }

    const original = item.content.trim();
    const edited = item.editedContent?.trim() ?? "";
    const text = edited || original;
    // Öğrenme sinyali için: metin gerçekten elden geçti mi (yoksa ready AI çıktısı mı).
    const wasEdited = edited.length > 0 && edited !== original;

    const log = await prisma.publishLog.create({
      data: {
        accountId: item.accountId,
        content: text,
        platform: "x",
        externalId: null,
        success: true,
        scheduledAt: item.scheduledAt,
        payload: JSON.stringify({ manualPublish: true }),
      },
    });

    const updatedItem = await prisma.queueItem.update({
      where: { id: queueItemId },
      data: { status: "manual_published", publishedAt: new Date(), lastError: null },
    });

    await prisma.usageLog.create({
      data: {
        accountId: item.accountId,
        type: "publish",
        tweetCount: 1,
        estimatedCostUsd: 0,
        date: new Date().toISOString().slice(0, 10),
      },
    });

    // Record the publication event in the performance ledger (PublishedPost) so
    // the learn cron can later attach real engagement snapshots and feed the
    // lessonGate promotion. draftQueueItemId is the provenance join back to the
    // pattern this draft was grounded on. Best-effort — a ledger hiccup must
    // never undo a successful publish. (Previously nothing populated this table,
    // orphaning PerformanceSnapshot + lessonGate.)
    await performanceRepo
      .createPublished({
        accountId: item.accountId,
        platform: "x",
        content: text,
        draftQueueItemId: queueItemId,
      })
      .catch(() => {});

    // Öğrenme sinyali — DÜRÜST: yalnız metin gerçekten elden geçtiyse "edited"
    // FeedbackEvent + TrainingExample yaz. Edit-gate kalktığı için ready AI
    // çıktısı düzenlenmeden yayınlanabilir; o durumda sahte "edited" sinyali
    // ÜRETME (aksi hâlde eğitim verisi kirlenir). Best-effort — öğrenme hattı
    // aksaklığı başarılı yayını asla geri almaz.
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

    // maskulenkod: every PUBLISHED tweet gets a topic-relevant image, generated
    // here (publish time) so rejected drafts never burn credits. grafikcem stays
    // manual (button). Fail-open + budget-gated + deduped inside imageService —
    // an image failure must never undo a successful publish.
    let generatedImageUrl: string | null = updatedItem.generatedImageUrl ?? null;
    if (item.account.handle === "maskulenkod" && !generatedImageUrl) {
      const img = await imageService.generateForQueueItem(queueItemId).catch(() => null);
      if (img?.generatedImageUrl) generatedImageUrl = img.generatedImageUrl;
    }

    return { log, item: updatedItem, generatedImageUrl };
  },
};
