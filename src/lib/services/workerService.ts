import { prisma } from "@/lib/db/client";
import { cronRunRepo } from "@/lib/db/cronRunRepo";
import * as fs from "fs";
import * as path from "path";

// Vercel serverless: the function root (/var/task) is read-only and invocations
// share no filesystem — every fs heartbeat/lock below is local-dev only.
const isServerless = () => Boolean(process.env.VERCEL);

export const workerService = {
  async writeHeartbeat(
    now = new Date(),
    extra: {
      lastScanResult?: any;
      lastError?: string;
      lastScanStartedAt?: string;
      lastScanFinishedAt?: string;
    } = {}
  ) {
    if (isServerless()) return; // read-only fs; serverless liveness comes from CronRun rows
    try {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const heartbeatPath = path.join(dataDir, "worker_heartbeat.json");

      let currentData: any = {};
      if (fs.existsSync(heartbeatPath)) {
        try {
          currentData = JSON.parse(fs.readFileSync(heartbeatPath, "utf-8"));
        } catch {}
      }

      const newData = {
        ...currentData,
        lastTickAt: now.toISOString(),
        ...extra,
      };

      fs.writeFileSync(heartbeatPath, JSON.stringify(newData, null, 2), "utf-8");
    } catch (err) {
      console.error("Worker heartbeat yazılırken hata oluştu:", err);
    }
  },

  async scanTick(
    now = new Date(),
    options?: { force?: boolean; targetHandles?: string[] }
  ) {
    await this.writeHeartbeat(now, { lastScanStartedAt: now.toISOString() });

    let cronRunId: string | null = null;
    let lockPath: string | null = null;

    if (isServerless()) {
      // Vercel: no shared filesystem → DB advisory lock + heartbeat row instead.
      if (await cronRunRepo.hasRunning("manual_scan")) {
        console.log("[Worker] Scan is already running (CronRun lock). Skipping tick.");
        return { success: false, reason: "locked" };
      }
      try {
        cronRunId = (await cronRunRepo.start("manual_scan")).id;
      } catch (err) {
        // Heartbeat bookkeeping must never block the scan itself.
        console.error("CronRun start yazılırken hata oluştu:", err);
      }
    } else {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      lockPath = path.join(dataDir, "scan.lock");
      const STALE_LOCK_MS = 10 * 60 * 1000; // a scan tick should never exceed 10 min

      if (fs.existsSync(lockPath)) {
        // Stale-lock recovery: a crashed/killed tick can leave the lock behind.
        // Treat a lock older than STALE_LOCK_MS as dead and reclaim it.
        let stale = false;
        try {
          const ageMs = now.getTime() - fs.statSync(lockPath).mtimeMs;
          stale = ageMs > STALE_LOCK_MS;
        } catch {
          stale = true; // unreadable lock → reclaim
        }
        if (!stale) {
          console.log("[Worker] Scan is already running. Skipping tick.");
          return { success: false, reason: "locked" };
        }
        console.warn("[Worker] Reclaiming stale scan.lock (older than 10m).");
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      }

      fs.writeFileSync(lockPath, now.toISOString(), "utf-8");
    }

    const results: any[] = [];
    try {
      const { scanService } = await import("@/lib/services/scanService");
      const { draftService } = await import("@/lib/services/draftService");
      const { prisma } = await import("@/lib/db/client");
      const { getLocalDayBounds } = await import("@/lib/utils/date");
      const { usageService } = await import("@/lib/services/usageService");

      let accounts = await prisma.account.findMany({
        include: { schedule: true }
      });

      if (options?.targetHandles) {
        accounts = accounts.filter(a => options.targetHandles!.includes(a.handle));
      }

      for (const account of accounts) {
        const accountResult: any = {
          account: account.handle,
          status: "skipped",
          sourcesScanned: 0,
          tweetsFound: 0,
          postsInserted: 0,
          duplicatesFound: 0,
          candidateSourcePostsFound: 0,
          draftAttempts: 0,
          draftsCreated: 0,
          draftsBlocked: 0,
          draftErrors: 0,
          reason: ""
        };

        if (!account.schedule?.automationEnabled) {
          console.log(`[Worker] Skipping @${account.handle} - automation disabled.`);
          accountResult.reason = "no_enabled_sources";
          results.push(accountResult);
          continue;
        }

        const lastScan = account.schedule.lastScanAt;
        const { start: todayStart } = getLocalDayBounds("Europe/Istanbul", now);
        const todayDrafts = await prisma.queueItem.count({
          where: {
            accountId: account.id,
            createdAt: { gte: todayStart }
          }
        });

        if (todayDrafts >= account.schedule.dailyMaxPosts) {
          console.log(`[Worker] Skipping @${account.handle} - daily draft limit reached (${todayDrafts}/${account.schedule.dailyMaxPosts}).`);
          accountResult.reason = "daily_limit_reached";
          results.push(accountResult);
          continue;
        }

        let draftsCreatedThisTick = 0;
        const targetDraftLimit = account.schedule.dailyMaxPosts - todayDrafts;

        // ── Phase 1: Try existing DB backlog SourcePost candidates first ──────────────────────────
        let backlogPosts = (await prisma.sourcePost.findMany({
          where: {
            accountId: account.id,
            status: { in: ["new", "scored"] }
          },
          orderBy: [
            { opportunityScore: "desc" },
            { viralScore: "desc" }
          ],
          take: 15
        })) || [];

        const draftedItems = await prisma.queueItem.findMany({
          where: { accountId: account.id, sourcePostId: { not: null } },
          select: { sourcePostId: true }
        });
        const draftedIds = (draftedItems || []).map(q => q.sourcePostId);

        backlogPosts = backlogPosts.filter(p => p && !draftedIds.includes(p.id));
        accountResult.candidateSourcePostsFound = backlogPosts.length;

        if (backlogPosts.length > 0) {
          console.log(`[Worker] Backlog SourcePosts found for @${account.handle}: ${backlogPosts.length} candidates. Trying backlog fallback.`);
          for (const post of backlogPosts) {
            if (draftsCreatedThisTick >= targetDraftLimit) break;
            if (accountResult.draftAttempts >= 5) break;

            accountResult.draftAttempts++;
            try {
              const result = await draftService.generateDraft({
                accountHandle: account.handle,
                sourcePostId: post.id,
                draftType: "TWEET",
              });

              if (!result.blocked) {
                draftsCreatedThisTick++;
                accountResult.draftsCreated++;
                await prisma.sourcePost.update({
                  where: { id: post.id },
                  data: { status: "used" }
                });
              } else {
                accountResult.draftsBlocked++;
                await prisma.sourcePost.update({
                  where: { id: post.id },
                  data: { status: "blocked" }
                });
              }
            } catch (draftErr) {
              console.error(`[Worker] Backlog draft error for @${account.handle} (Post: ${post.id}):`, draftErr);
              accountResult.draftErrors++;
              await prisma.sourcePost.update({
                where: { id: post.id },
                data: { status: "error" }
              });
            }
          }

          if (draftsCreatedThisTick > 0) {
            accountResult.status = "success";
            accountResult.reason = "existing_source_posts_used";
            await prisma.schedule.update({
              where: { accountId: account.id },
              data: { lastScanAt: now }
            });
            results.push(accountResult);
            continue;
          }
        }

        // ── Phase 2: Budget-safe API Scan (if backlog did not yield today's draft) ───────────────
        if (lastScan && !options?.force) {
          const hoursSinceLastScan = (now.getTime() - new Date(lastScan).getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastScan < 18) {
             console.log(`[Worker] Skipping @${account.handle} scan - scanned recently (${hoursSinceLastScan.toFixed(1)}h ago).`);
             accountResult.reason = "daily_limit_reached";
             results.push(accountResult);
             continue;
          }
        }

        const remaining = await usageService.getRemainingDailyTweets();
        if (remaining <= 0) {
          console.log(`[Worker] Skipping @${account.handle} scan - SocialData budget reached.`);
          accountResult.reason = "socialdata_budget_reached";
          results.push(accountResult);
          continue;
        }

        try {
          console.log(`[Worker] Starting budgeted scan for @${account.handle} (max 2 posts per source)`);
          const scanResult = await scanService.scanAccount(account.handle, 2);

          accountResult.sourcesScanned = scanResult.sourcesScanned;
          accountResult.tweetsFound = scanResult.tweetsFound;
          accountResult.postsInserted = scanResult.postsInserted;
          accountResult.duplicatesFound += scanResult.duplicatesFound;

          const candidatePosts = scanResult.posts || [];
          accountResult.candidateSourcePostsFound += candidatePosts.length;

          if (candidatePosts.length > 0) {
            const topPosts = candidatePosts
              .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
              .slice(0, 5);

            for (const post of topPosts) {
              if (draftsCreatedThisTick >= targetDraftLimit) break;
              if (accountResult.draftAttempts >= 5) break;

              const existingDraft = await prisma.queueItem.findFirst({
                where: { sourcePostId: post.id }
              });

              if (existingDraft) {
                accountResult.duplicatesFound++;
                continue;
              }

              accountResult.draftAttempts++;
              try {
                const result = await draftService.generateDraft({
                  accountHandle: account.handle,
                  sourcePostId: post.id,
                  draftType: "TWEET",
                });
                
                if (!result.blocked) {
                  draftsCreatedThisTick++;
                  accountResult.draftsCreated++;
                  await prisma.sourcePost.update({
                    where: { id: post.id },
                    data: { status: "used" }
                  });
                } else {
                  accountResult.draftsBlocked++;
                  await prisma.sourcePost.update({
                    where: { id: post.id },
                    data: { status: "blocked" }
                  });
                }
              } catch (draftErr) {
                console.error(`[Worker] Scanned draft error for @${account.handle} (Post: ${post.id}):`, draftErr);
                accountResult.draftErrors++;
                await prisma.sourcePost.update({
                  where: { id: post.id },
                  data: { status: "error" }
                });
              }
            }
          }

          if (draftsCreatedThisTick > 0) {
            accountResult.status = "success";
            accountResult.reason = "scanned_and_generated";
          } else {
            accountResult.status = "skipped";
            if (accountResult.draftsBlocked > 0) {
              accountResult.reason = "all_candidates_quality_blocked";
            } else if (accountResult.draftErrors > 0) {
              accountResult.reason = "model_error";
            } else if (scanResult.tweetsFound === 0) {
              accountResult.reason = "no_tweets_found";
            } else {
              accountResult.reason = "all_candidates_duplicate";
            }
          }
          
          await prisma.schedule.update({
            where: { accountId: account.id },
            data: { lastScanAt: now }
          });

          results.push(accountResult);
        } catch (accountErr) {
          console.error(`[Worker] Scan failed for @${account.handle}:`, accountErr);
          accountResult.status = "error";
          accountResult.reason = "model_error";
          accountResult.error = String(accountErr);
          results.push(accountResult);
        }
      }

      await this.writeHeartbeat(now, {
        lastScanFinishedAt: new Date().toISOString(),
        lastScanResult: { success: true, timestamp: now, results }
      });
      if (cronRunId) {
        await cronRunRepo.finish(cronRunId, { ok: true, result: { results } });
      }
      return { success: true, timestamp: now, results };
    } catch (err) {
      await this.writeHeartbeat(now, {
        lastScanFinishedAt: new Date().toISOString(),
        lastError: String(err)
      });
      if (cronRunId) {
        await cronRunRepo.finish(cronRunId, { ok: false, error: String(err) });
      }
      throw err;
    } finally {
      if (lockPath && fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    }
  },

  async pruneTick(now = new Date()) {
    // Optional / minimal cleanup: prune old publish logs or scan runs
    return { success: true, timestamp: now };
  },
};
