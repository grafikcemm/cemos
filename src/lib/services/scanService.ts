import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";
import { sourceRepo } from "@/lib/db/sourceRepo";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { scanRunRepo } from "@/lib/db/scanRunRepo";
import { usageService } from "@/lib/services/usageService";
import { fetchUserTweets, meetsThreshold, calculateCost } from "@/lib/socialdata";
import { getCostLimits, getMaxSourcesForAccount } from "@/lib/config/costLimits";
import type { SourcePost } from "@/generated/prisma/client";

export type ScanResult = {
  scanRunId: string;
  sourcesScanned: number;
  tweetsFound: number;
  postsInserted: number;
  duplicatesFound: number;
  retweetsSkipped: number;
  estimatedCostUsd: number;
  errors: string[];
  posts: SourcePost[];
};

export const scanService = {
  async scanAccount(accountHandle: string, postsPerSource?: number): Promise<ScanResult> {
    const account = await accountRepo.findByHandle(accountHandle);
    if (!account) throw new Error(`Account not found: ${accountHandle}`);

    const scanRun = await scanRunRepo.create(account.id);

    // Bütçeler ve Limitler
    const limits = getCostLimits();
    const dailyBudget = limits.dailyTweetBudget;
    // Arketip-bazlı cap: grafikcem/maskulenkod.
    const maxSources = getMaxSourcesForAccount(accountHandle);
    const maxTweetsPerSource = postsPerSource ?? limits.maxTweetsPerSource;

    const remaining = await usageService.getRemainingDailyTweets();
    if (remaining <= 0) {
      const errors = [`Günlük SocialData bütçe limiti doldu (${dailyBudget})`];
      await scanRunRepo.finish(scanRun.id, {
        sourcesScanned: 0,
        tweetsFound: 0,
        postsInserted: 0,
        estimatedCostUsd: 0,
        errors,
      });
      return {
        scanRunId: scanRun.id,
        sourcesScanned: 0,
        tweetsFound: 0,
        postsInserted: 0,
        duplicatesFound: 0,
        retweetsSkipped: 0,
        estimatedCostUsd: 0,
        errors,
        posts: [],
      };
    }

    let sources = await sourceRepo.listEnabledByAccount(account.id);
    if (sources.length > maxSources) {
      sources = sources.slice(0, maxSources);
    }

    const errors: string[] = [];
    const posts: SourcePost[] = [];
    let tweetsFound = 0;
    let postsInserted = 0;
    let duplicatesFound = 0;
    let retweetsSkipped = 0;
    let totalCost = 0;
    let totalTweets = 0;

    for (const source of sources) {
      try {
        const { tweets, twitterUserId, lookupPerformed, retweetsFiltered } = await fetchUserTweets(
          source.handle,
          maxTweetsPerSource,
          source.socialDataUserId
        );

        // User lookup yapıldıysa Source tablosunda kalıcı olarak cache'le
        if (lookupPerformed && twitterUserId) {
          await prisma.source.update({
            where: { id: source.id },
            data: {
              socialDataUserId: twitterUserId,
              socialDataUserIdUpdatedAt: new Date(),
            },
          });
        }

        // Maliyet hesabı: (Eğer lookup yapıldıysa +1) + tweet sayısı. Her biri 1 item ($0.0002)
        const itemsCharged = (lookupPerformed ? 1 : 0) + tweets.length;
        totalCost += calculateCost(itemsCharged);
        
        tweetsFound += tweets.length;
        retweetsSkipped += retweetsFiltered;
        totalTweets += itemsCharged; // Bütçeden düşülürken lookup maliyeti de hesaba katılır

        const filtered = tweets.filter((t) => meetsThreshold(t, source.thresholdLikes));

        for (const tweet of filtered) {
          // Bu tweet zaten veritabanımızda kayıtlı mı kontrol et
          const existing = await prisma.sourcePost.findUnique({
            where: { tweetId: tweet.id },
          });

          const post = await sourcePostRepo.upsertByTweetId({
            accountId: account.id,
            sourceId: source.id,
            tweetId: tweet.id,
            text: tweet.text,
            likeCount: tweet.likeCount,
            retweetCount: tweet.retweetCount,
            viewCount: tweet.viewCount,
            viralScore: tweet.viralScore,
            url: tweet.url,
            publishedAt: tweet.createdAt ? new Date(tweet.createdAt) : undefined,
            opportunityScore: tweet.viralScore / 100,
            // Carry scanned tweet media so drafts can surface a source image. [] if none.
            mediaUrls: JSON.stringify(tweet.mediaUrls ?? []),
          });

          if (existing) {
            duplicatesFound++;
          } else {
            posts.push(post);
            postsInserted++;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
        const is404 = /404|not found|user not found/i.test(msg);
        if (is404) {
          await prisma.source.update({
            where: { id: source.id },
            data: { archivedAt: new Date(), enabled: false },
          });
          errors.push(`@${source.handle} bulunamadı, kaynak arşivlendi.`);
        } else {
          errors.push(`${source.handle}: ${msg}`);
        }
      }
    }

    await usageService.recordScan({
      accountId: account.id,
      tweetCount: totalTweets,
      estimatedCostUsd: totalCost,
    });

    await scanRunRepo.finish(scanRun.id, {
      sourcesScanned: sources.length,
      tweetsFound,
      postsInserted,
      estimatedCostUsd: totalCost,
      errors,
    });

    return {
      scanRunId: scanRun.id,
      sourcesScanned: sources.length,
      tweetsFound,
      postsInserted,
      duplicatesFound,
      retweetsSkipped,
      estimatedCostUsd: totalCost,
      errors,
      posts,
    };
  },
};
