import { prisma } from "@/lib/db/client";
import { qualityLintService } from "@/lib/services/qualityLintService";
import { draftService } from "@/lib/services/draftService";

export function isWithinQuietHours(date: Date, start: number, end: number): boolean {
  if (start === end) return false;
  const hour = date.getHours();
  if (start < end) {
    return hour >= start && hour < end;
  } else {
    return hour >= start || hour < end;
  }
}

export function parseSlotKey(slotKey: string, now = new Date()): Date {
  const target = new Date(now);
  if (slotKey === "15 dk") {
    target.setMinutes(target.getMinutes() + 15);
  } else if (slotKey === "30 dk") {
    target.setMinutes(target.getMinutes() + 30);
  } else if (slotKey === "1 saat") {
    target.setHours(target.getHours() + 1);
  } else if (slotKey === "2 saat") {
    target.setHours(target.getHours() + 2);
  } else if (slotKey === "4 saat") {
    target.setHours(target.getHours() + 4);
  } else if (slotKey === "yarın 09:00") {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  } else {
    throw new Error("Invalid slot key");
  }
  return target;
}

function getDayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export const scheduleService = {
  async approve(queueItemId: string) {
    const item = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: { account: true },
    });
    if (!item) throw new Error("queue_item_not_found");
    if (item.status === "published" || item.status === "rejected") {
      throw new Error("invalid_status");
    }

    const content = (item.editedContent?.trim() || item.content.trim());
    if (!content) throw new Error("empty_content");

    // Recalculate lint to verify no blockers exist
    const maxChars = item.account.maxChars || 280;
    const report = await qualityLintService.lint(content, item.draftType, maxChars, { forceDeterministicOnly: true });
    if (!report.passed) {
      throw new Error("lint_blocked");
    }

    return prisma.queueItem.update({
      where: { id: queueItemId },
      data: {
        status: "approved",
        approvedAt: new Date(),
        lastError: null,
        lintReport: JSON.stringify(report),
      },
    });
  },

  async reject(queueItemId: string) {
    const item = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
    });
    if (!item) throw new Error("queue_item_not_found");
    if (item.status === "published") {
      throw new Error("invalid_status");
    }

    return prisma.queueItem.update({
      where: { id: queueItemId },
      data: {
        status: "rejected",
      },
    });
  },

  async scheduleDraft(queueItemId: string, scheduledAt: Date) {
    const item = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: { account: { include: { schedule: true } } },
    });
    if (!item) throw new Error("queue_item_not_found");
    if (item.status === "published" || item.status === "rejected") {
      throw new Error("invalid_status");
    }

    const content = (item.editedContent?.trim() || item.content.trim());
    if (!content) throw new Error("empty_content");

    // Guardrail: scheduledAt > now + 60s
    if (scheduledAt.getTime() <= Date.now() + 60 * 1000) {
      throw new Error("past_date");
    }

    // Guardrail: Lint check
    const maxChars = item.account.maxChars || 280;
    const report = await qualityLintService.lint(content, item.draftType, maxChars, { forceDeterministicOnly: true });
    if (!report.passed) {
      throw new Error("lint_blocked");
    }

    // Guardrail: Max character limit
    if (content.length > maxChars) {
      throw new Error("char_limit");
    }

    const schedule = item.account.schedule;
    if (schedule) {
      // Guardrail: Quiet Hours check
      if (isWithinQuietHours(scheduledAt, schedule.quietStartHour, schedule.quietEndHour)) {
        throw new Error("quiet_hours_active");
      }

      // Guardrail: Daily Cap limit check
      const { start, end } = getDayBounds(scheduledAt);
      const successfulPublishLogsCount = await prisma.publishLog.count({
        where: {
          accountId: item.accountId,
          success: true,
          publishedAt: { gte: start, lte: end },
        },
      });
      const scheduledQueueItemsCount = await prisma.queueItem.count({
        where: {
          accountId: item.accountId,
          status: "scheduled",
          scheduledAt: { gte: start, lte: end },
          id: { not: queueItemId },
        },
      });

      if (successfulPublishLogsCount + scheduledQueueItemsCount >= schedule.dailyMaxPosts) {
        throw new Error("daily_cap_reached");
      }
    }

    return prisma.queueItem.update({
      where: { id: queueItemId },
      data: {
        status: "scheduled",
        scheduledAt,
        approvedAt: item.approvedAt || new Date(),
        lintReport: JSON.stringify(report),
        lastError: null,
      },
    });
  },

  async quickSlot(queueItemId: string, slotKey: string) {
    const scheduledAt = parseSlotKey(slotKey);
    return this.scheduleDraft(queueItemId, scheduledAt);
  },

  async regenerate(queueItemId: string) {
    const item = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: { account: true, sourcePost: true },
    });
    if (!item) throw new Error("queue_item_not_found");

    return draftService.generateDraft({
      accountHandle: item.account.handle,
      sourcePostId: item.sourcePostId || undefined,
      sourceTweet: item.sourcePost?.text || item.content,
      sourceHandle: item.sourcePost?.accountId || undefined,
      draftType: item.draftType,
      mode: item.mode,
    });
  },

  async deleteDraft(queueItemId: string) {
    const item = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
    });
    if (!item) throw new Error("queue_item_not_found");
    if (item.status === "published") {
      throw new Error("published_delete_refused");
    }
    return prisma.queueItem.delete({ where: { id: queueItemId } });
  },
};
