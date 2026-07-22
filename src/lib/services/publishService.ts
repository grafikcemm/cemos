import { prisma } from "@/lib/db/client";
import { isWithinQuietHours } from "@/lib/services/scheduleService";
import { qualityLintService } from "@/lib/services/qualityLintService";
import { isNearDuplicate } from "@/lib/utils/textSimilarity";

// Faz 1E (ADR-025): manuel yayÄ±n onayÄ± publishAttemptService.confirmManualPublish
// state machine'ine taÅŸÄ±ndÄ± â€” markManualPublished bu dosyadan KALDIRILDI. YayÄ±n
// durumunu yazan tek yol o servistir; burada yalnÄ±z yayÄ±n-Ã¶ncesi kapÄ±lar kaldÄ±.

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
};
