import { getWatchedSources } from "@/lib/sources";
import { xConnector } from "@/lib/sources/x";
import type { NormalizedItem, SourceConnector } from "@/lib/sources/types";

/**
 * Free, logged-out X connector backed by @the-convocation/twitter-scraper.
 *
 * Strategy: try the free logged-out scraper first; if it yields nothing (rate
 * limited, blocked, disabled) fall back transparently to the paid SocialData
 * connector. Both layers are fail-open — never throw, return [] on any error —
 * so one flaky provider can't abort discovery.
 *
 * ─── SECURITY (do not remove) ──────────────────────────────────────────────
 * This connector runs LOGGED OUT only. It MUST NEVER authenticate with the
 * brand account's (@grafikcem / @maskulenkod) cookies or credentials —
 * scraping while logged in as the brand account risks a permanent X ban.
 * If cookie auth is ever added it must use a disposable throwaway account,
 * never a real brand identity. There is intentionally no login() call below.
 * ───────────────────────────────────────────────────────────────────────────
 */

const HANDLE_CAP = 4; // parity with SocialData path; also caps scraper rate-limit exposure
// Below this many scraped items we treat the free scrape as too thin (likely
// rate-limited mid-stream) and fall through to the paid SocialData fallback
// rather than letting a near-empty scrape suppress a fuller paid fetch.
const MIN_USEFUL_YIELD = 3;

function scraperEnabled(): boolean {
  return process.env.X_SCRAPER_ENABLED === "true";
}

/** Scrape one user's recent public tweets logged-out. Fail-open: [] on any error. */
async function scrapeUserLoggedOut(username: string, maxTweets: number): Promise<NormalizedItem[]> {
  // Dynamic import: the scraper dep is heavy and optional, so only load it when
  // the feature is actually enabled.
  const mod = await import("@the-convocation/twitter-scraper").catch(() => null);
  if (!mod) return [];

  const items: NormalizedItem[] = [];
  try {
    const scraper = new mod.Scraper();
    // NO scraper.login() — see SECURITY note above. Logged-out timeline only.
    for await (const t of scraper.getTweets(username, maxTweets)) {
      if (!t?.id || !t?.text) continue;
      const likes = t.likes ?? 0;
      const retweets = t.retweets ?? 0;
      const replies = t.replies ?? 0;
      items.push({
        sourceType: "x",
        externalId: t.id,
        text: t.text,
        url: t.permanentUrl ?? `https://x.com/${t.username ?? username}/status/${t.id}`,
        author: `@${t.username ?? username}`,
        lang: "tr",
        engagementScore: likes + retweets * 2 + replies,
        sourceWeight: 0.9,
        publishedAt: t.timeParsed ? new Date(t.timeParsed) : undefined,
      });
      if (items.length >= maxTweets) break;
    }
  } catch {
    // Rate limit / network / parse error — return whatever we gathered so far.
    return items;
  }
  return items;
}

export const xScraperConnector: SourceConnector = {
  type: "x",
  isConfigured(): boolean {
    // Configured if either the free scraper is enabled or the paid fallback has a key.
    return scraperEnabled() || xConnector.isConfigured();
  },
  async fetchForAccount(handle: string, limit: number): Promise<NormalizedItem[]> {
    if (scraperEnabled()) {
      const handles = getWatchedSources(handle).slice(0, HANDLE_CAP);
      if (handles.length > 0) {
        const perHandle = Math.max(2, Math.ceil(limit / handles.length));
        const settled = await Promise.allSettled(
          handles.map((s) => scrapeUserLoggedOut(s.handle, perHandle))
        );
        const items: NormalizedItem[] = [];
        for (const r of settled) {
          if (r.status === "fulfilled") items.push(...r.value);
        }
        if (items.length >= MIN_USEFUL_YIELD) {
          items.sort((a, b) => b.engagementScore - a.engagementScore);
          return items.slice(0, limit);
        }
      }
    }

    // Free scrape disabled or empty → paid SocialData fallback (itself key-gated + fail-open).
    return xConnector.fetchForAccount(handle, limit);
  },
};
