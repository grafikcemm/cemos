import { prisma } from "@/lib/db/client";
import { accountProfiles, type AccountHandle } from "@/lib/accounts";
import { draftService } from "@/lib/services/draftService";
import { discoveryService, type DiscoverySummary } from "@/lib/services/discoveryService";
import { miningService, type MiningSummary } from "@/lib/services/miningService";
import { getLocalDayBounds } from "@/lib/utils/date";

export type DailyRunSummary = {
  handle: AccountHandle;
  discovery: DiscoverySummary | null;
  mining: MiningSummary | null;
  dailyMax: number;
  todayDrafts: number;
  target: number;
  attempts: number;
  created: number;
  blocked: number;
  errors: number;
  reason: string;
};

export const pipelineService = {
  /**
   * On-demand daily run for one account: multi-source discovery, then generate
   * up to the remaining daily quota from the freshest high-opportunity posts.
   * Replaces the always-on cron worker for the manual-operator workflow — call
   * it from `npm run discover` or a thin scheduler hitting /api/cron/daily.
   */
  async runDailyForAccount(
    handle: AccountHandle,
    opts?: { discover?: boolean; mine?: boolean; dailyMax?: number; deadlineMs?: number }
  ): Promise<DailyRunSummary> {
    const profile = accountProfiles[handle];
    if (!profile) throw new Error(`Profile not found: ${handle}`);

    const account = await prisma.account.findUnique({
      where: { handle },
      include: { schedule: true },
    });
    if (!account) throw new Error(`Account not found: ${handle}`);

    const dailyMax = opts?.dailyMax ?? account.schedule?.dailyMaxPosts ?? profile.defaultDraftCount ?? 3;

    // 1) Discover external content, 2) deliberate + mine viral patterns, 3) generate.
    const discovery =
      opts?.discover === false ? null : await discoveryService.discoverForAccount(handle);
    const mining =
      opts?.mine === false ? null : await miningService.mineTopItems(handle, dailyMax);

    const { start } = getLocalDayBounds("Europe/Istanbul", new Date());
    const todayDrafts = await prisma.queueItem.count({
      where: { accountId: account.id, createdAt: { gte: start } },
    });
    const target = Math.max(0, dailyMax - todayDrafts);

    const summary: DailyRunSummary = {
      handle,
      discovery,
      mining,
      dailyMax,
      todayDrafts,
      target,
      attempts: 0,
      created: 0,
      blocked: 0,
      errors: 0,
      reason: "",
    };

    if (target === 0) {
      summary.reason = "daily_target_met";
      return summary;
    }

    const drafted = await prisma.queueItem.findMany({
      where: { accountId: account.id, sourcePostId: { not: null } },
      select: { sourcePostId: true },
    });
    const draftedIds = new Set(drafted.map((d) => d.sourcePostId));

    const candidates = (
      await prisma.sourcePost.findMany({
        where: { accountId: account.id, status: { in: ["new", "scored", "mined"] } },
        orderBy: [{ opportunityScore: "desc" }, { viralScore: "desc" }],
        take: 20,
      })
    ).filter((p) => !draftedIds.has(p.id));

    for (const post of candidates) {
      if (summary.created >= target) break;
      if (summary.attempts >= target + 5) break;
      // In-flight cancellation: stop starting new drafts once the cron deadline
      // is reached so the invocation can persist its result before being killed.
      if (opts?.deadlineMs && Date.now() > opts.deadlineMs) {
        summary.reason = summary.reason || "deadline";
        break;
      }
      summary.attempts++;
      try {
        const result = await draftService.generateDraft({
          accountHandle: handle,
          sourcePostId: post.id,
          draftType: "TWEET",
          deadlineMs: opts?.deadlineMs,
        });
        if (result.blocked) {
          summary.blocked++;
          if (result.reason === "budget") {
            summary.reason = "budget_exhausted";
            break;
          }
          await prisma.sourcePost.update({ where: { id: post.id }, data: { status: "blocked" } });
        } else {
          summary.created++;
          await prisma.sourcePost.update({ where: { id: post.id }, data: { status: "used" } });
        }
      } catch {
        summary.errors++;
        await prisma.sourcePost.update({ where: { id: post.id }, data: { status: "error" } });
      }
    }

    summary.reason = summary.reason || (summary.created > 0 ? "generated" : "no_usable_candidates");
    return summary;
  },
};
