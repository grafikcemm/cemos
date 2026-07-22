/**
 * CemOS Haber — dış popülerlik sinyalleri (Hacker News + Reddit).
 *
 * "Çok konuşulan" buzz skorunun dış-dünya bileşeni. supadata.ts deseni: ASLA
 * throw etmez, hata/IP-bloğu → boş döner (buzz iç sinyallerle yine çalışır).
 * Anahtarsız public uçlar; HN Algolia güvenilir, Reddit Vercel IP'sinde
 * bloklanabilir (bkz. learn Gemini IP bloğu) → best-effort.
 */

const FETCH_TIMEOUT_MS = 8_000;
const HN_FRONTPAGE_URL =
  "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50";
const REDDIT_TOP_URL =
  "https://www.reddit.com/r/artificial+MachineLearning+technology/top.json?t=day&limit=50";

export type SignalSource = "hn" | "reddit";

export interface ExternalSignal {
  /** Konuşulan makalenin dış URL'i (normalize edilmemiş ham hali). */
  url: string;
  points: number;
  comments: number;
  source: SignalSource;
}

/** Bir habere eşlenen toplulaştırılmış dış sinyaller. */
export interface MatchedSignals {
  hnPoints: number;
  hnComments: number;
  redditScore: number;
}

type HnHit = { url?: string | null; points?: number | null; num_comments?: number | null };
type RedditChild = { data?: { url?: string | null; score?: number | null; num_comments?: number | null } };

async function fetchJsonSafe(url: string, headers?: Record<string, string>): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) {
      console.warn(`[news] external signal HTTP ${res.status} — ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[news] external signal error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Hacker News ön sayfa hikâyeleri (Algolia, anahtarsız). Hata → []. */
export async function fetchHackerNewsSignals(): Promise<ExternalSignal[]> {
  const json = (await fetchJsonSafe(HN_FRONTPAGE_URL)) as { hits?: HnHit[] } | null;
  const hits = Array.isArray(json?.hits) ? json!.hits : [];
  const signals: ExternalSignal[] = [];
  for (const h of hits) {
    if (!h?.url) continue; // Ask HN / metin gönderileri — eşleşecek dış URL yok
    signals.push({
      url: h.url,
      points: Math.max(0, Number(h.points) || 0),
      comments: Math.max(0, Number(h.num_comments) || 0),
      source: "hn",
    });
  }
  return signals;
}

/** Reddit AI/teknoloji top (gün). Vercel IP'sinde bloklanabilir → []. */
export async function fetchRedditSignals(): Promise<ExternalSignal[]> {
  // Honest bot UA (Reddit's IP block isn't bypassed by spoofing a browser anyway).
  const json = (await fetchJsonSafe(REDDIT_TOP_URL, {
    "User-Agent": "CemOS-News/1.0 (AI news aggregator)",
  })) as { data?: { children?: RedditChild[] } } | null;
  const children = Array.isArray(json?.data?.children) ? json!.data!.children! : [];
  const signals: ExternalSignal[] = [];
  for (const c of children) {
    const url = c?.data?.url;
    if (!url || url.includes("reddit.com")) continue; // self/comment gönderileri atla
    signals.push({
      url,
      points: Math.max(0, Number(c.data?.score) || 0),
      comments: Math.max(0, Number(c.data?.num_comments) || 0),
      source: "reddit",
    });
  }
  return signals;
}

/**
 * URL'i eşleme anahtarına indirger: küçük harf host (www. atılır) + sondaki
 * slash'siz pathname. Query/hash yok sayılır — aynı makaleye farklı utm'lerle
 * gelen linkler tek anahtara düşer.
 */
export function normalizeUrlKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`;
  } catch {
    return null;
  }
}

/** Tüm dış sinyalleri normalize URL anahtarına göre toplulaştırır. */
export function indexSignals(signals: ExternalSignal[]): Map<string, MatchedSignals> {
  const index = new Map<string, MatchedSignals>();
  for (const s of signals) {
    const key = normalizeUrlKey(s.url);
    if (!key) continue;
    const cur = index.get(key) ?? { hnPoints: 0, hnComments: 0, redditScore: 0 };
    if (s.source === "hn") {
      cur.hnPoints = Math.max(cur.hnPoints, s.points);
      cur.hnComments = Math.max(cur.hnComments, s.comments);
    } else {
      cur.redditScore = Math.max(cur.redditScore, s.points);
    }
    index.set(key, cur);
  }
  return index;
}

export interface MatchableItem {
  id: string;
  url: string;
  canonicalUrl?: string | null;
}

/** Haberleri dış sinyallere URL ile eşler → { itemId → MatchedSignals }. */
export function matchSignalsToItems(
  items: MatchableItem[],
  signals: ExternalSignal[],
): Map<string, MatchedSignals> {
  const index = indexSignals(signals);
  const matched = new Map<string, MatchedSignals>();
  for (const item of items) {
    const key = normalizeUrlKey(item.canonicalUrl) ?? normalizeUrlKey(item.url);
    if (!key) continue;
    const hit = index.get(key);
    if (hit) matched.set(item.id, hit);
  }
  return matched;
}
