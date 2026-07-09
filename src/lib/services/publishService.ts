import { prisma } from "@/lib/db/client";
import { isWithinQuietHours } from "@/lib/services/scheduleService";
import { qualityLintService } from "@/lib/services/qualityLintService";
import { isNearDuplicate } from "@/lib/utils/textSimilarity";
import { imageService } from "@/lib/services/imageService";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { performanceRepo } from "@/lib/db/performanceRepo";

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

    // EDIT-GATE (absolute): raw AI output reads as spam. The operator must add
    // their own voice — block publishing unless editedContent differs from the
    // original AI content. @grafikcem = AI-native designer speaking from the field.
    const original = item.content.trim();
    const edited = item.editedContent?.trim() ?? "";
    if (!edited || edited === original) {
      throw new Error("edit_required");
    }

    const text = edited;

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

    // Manual publish is the strongest learning signal: the edit-gate above
    // guarantees the operator rewrote the AI draft in their own voice, so log
    // it as an "edited" FeedbackEvent + TrainingExample. Best-effort — a
    // learning-pipeline hiccup must never undo a successful publish. (Previously
    // the morning flow recorded nothing here, leaving Training Center at 0.)
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
