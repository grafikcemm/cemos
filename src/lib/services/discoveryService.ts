import type { AccountHandle } from "@/lib/accounts";
import { accountRepo } from "@/lib/db/accountRepo";
import { sourceRepo } from "@/lib/db/sourceRepo";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { rssConnector } from "@/lib/sources/rss";
import { redditConnector } from "@/lib/sources/reddit";
import { xScraperConnector } from "@/lib/sources/xScraper";
import { preFilterBatch } from "@/lib/sources/pre-filter";
import type { NormalizedItem, SourceConnector, SourceType } from "@/lib/sources/types";

// X is served by the free-first scraper connector, which falls back to the paid
// SocialData connector internally (see xScraper.ts).
const CONNECTORS: SourceConnector[] = [rssConnector, redditConnector, xScraperConnector];
const PER_CONNECTOR_LIMIT = 15;

export type DiscoverySummary = {
  handle: AccountHandle;
  fetched: number;
  afterDedupe: number;
  kept: number;
  inserted: number;
  byType: Record<string, number>;
  preFilterUsedLlm: boolean;
  preFilterReason?: string;
  errors: string[];
};

/** Derive a 5–99 viralScore and 0–1 opportunityScore from cross-platform signal. */
export function deriveScores(item: NormalizedItem): { viralScore: number; opportunityScore: number } {
  const engagement = Math.log10(item.engagementScore + 1) * 22; // big numbers compress
  const viralScore = Math.min(99, Math.max(5, Math.round(engagement * item.sourceWeight + item.sourceWeight * 25)));
  return { viralScore, opportunityScore: Math.min(1, viralScore / 100) };
}

function dedupe(items: NormalizedItem[]): NormalizedItem[] {
  const seen = new Set<string>();
  const out: NormalizedItem[] = [];
  for (const it of items) {
    const key = `${it.sourceType}:${it.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export const discoveryService = {
  /**
   * Fan out across every configured connector for one account, normalize,
   * dedupe, run the örn1 "keep loose" pre-filter, and persist survivors as
   * SourcePost. Connector failures never abort the run (Promise.allSettled +
   * fail-open connectors).
   */
  async discoverForAccount(handle: AccountHandle): Promise<DiscoverySummary> {
    const account = await accountRepo.findByHandle(handle);
    if (!account) throw new Error(`Account not found: ${handle}`);

    const errors: string[] = [];
    const settled = await Promise.allSettled(
      CONNECTORS.map((c) => c.fetchForAccount(handle, PER_CONNECTOR_LIMIT))
    );

    const collected: NormalizedItem[] = [];
    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        collected.push(...res.value);
      } else {
        errors.push(`${CONNECTORS[idx].type}: ${String(res.reason)}`);
      }
    });

    const deduped = dedupe(collected);
    const { kept, usedLlm, reason } = await preFilterBatch(deduped, handle);

    // Ensure one synthetic Source per platform, then upsert survivors.
    const sourceIdByType = new Map<SourceType, string>();
    const byType: Record<string, number> = {};
    let inserted = 0;

    for (const item of kept) {
      try {
        let sourceId = sourceIdByType.get(item.sourceType);
        if (!sourceId) {
          const src = await sourceRepo.ensureDiscoverySource(account.id, item.sourceType);
          sourceId = src.id;
          sourceIdByType.set(item.sourceType, sourceId);
        }
        const { viralScore, opportunityScore } = deriveScores(item);
        await sourcePostRepo.upsertByExternalId({
          accountId: account.id,
          sourceId,
          sourceType: item.sourceType,
          externalId: item.externalId,
          text: item.text,
          url: item.url,
          author: item.author,
          lang: item.lang,
          engagementScore: item.engagementScore,
          sourceWeight: item.sourceWeight,
          viralScore,
          opportunityScore,
          publishedAt: item.publishedAt,
        });
        inserted++;
        byType[item.sourceType] = (byType[item.sourceType] ?? 0) + 1;
      } catch (err) {
        errors.push(`persist ${item.sourceType}:${item.externalId}: ${String(err)}`);
      }
    }

    return {
      handle,
      fetched: collected.length,
      afterDedupe: deduped.length,
      kept: kept.length,
      inserted,
      byType,
      preFilterUsedLlm: usedLlm,
      preFilterReason: reason,
      errors,
    };
  },
};
