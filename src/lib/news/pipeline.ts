import { prisma } from "@/lib/db/client";
import { translateNews, scoreNews } from "@/lib/news/newsAi";
import { redactError } from "@/lib/utils/redactSecrets";
import { detectLanguage } from "@/lib/news/language";
import { DEFAULT_SOURCES } from "@/lib/news/sources";
import {
  classifySourceVerification,
  type VerificationCandidate,
} from "@/lib/news/sourceVerification";
import { computeBuzzScore } from "@/lib/news/buzz";
import {
  fetchHackerNewsSignals,
  fetchRedditSignals,
  matchSignalsToItems,
} from "@/lib/news/externalSignals";

// =============================================================================
// Chunked, idempotent, deadline-bounded news pipeline (Prisma/Neon port of
// grafikcem-news-ai/src/lib/pipeline.ts).
//
// processingStatus acts as the cursor: each stage picks up exactly where the
// previous tick stopped, so a mid-batch timeout loses nothing and no
// continuation tokens are needed. Every stage accepts a hard deadline (epoch ms)
// and processes as many items as fit before it.
//
// Status flow: raw → translated → analyzed  (failed/quarantined are off-path).
// =============================================================================

export interface StageResult {
  processed: number;
  errors: number;
  remaining: number;
  /** True when the stage stopped early because its deadline expired. */
  deadlineHit?: boolean;
}

export interface TickSummary {
  sync: StageResult;
  translate: StageResult;
  analyze: StageResult;
  /** Buzz enrichment stage (external HN/Reddit popularity → buzzScore). */
  buzz?: StageResult;
  remainingTotal: number;
  errorMessages: string[];
}

const SOURCE_ERROR_COOLDOWN_MS = 6 * 60 * 60 * 1000; // erroring sources retried after 6h
const SOURCE_ERROR_THRESHOLD = 5;
const STUCK_RETRY_WINDOW_MS = 48 * 60 * 60 * 1000; // failed items younger than this get re-queued
const STUCK_MIN_AGE_MS = 2 * 60 * 60 * 1000; // ...but only if last attempt was over 2h ago
const STALE_NEWS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // pending items published before this are quarantined

// Items scoring below this never reach the operator: they are archived as
// "low_score" instead of "analyzed" (kept in DB so the url-unique dedup keeps
// blocking re-fetch → re-translate → re-analyze LLM spend on the same story).
export const LOW_SCORE_THRESHOLD = 70;

// Cross-source corroboration looks at headlines fetched within this window.
const VERIFICATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const VERIFICATION_CORPUS_LIMIT = 300;

// Buzz enrichment scores items fetched within this window (reader feed horizon).
const BUZZ_WINDOW_MS = 48 * 60 * 60 * 1000;
const BUZZ_MAX_ITEMS = 300;

function timeLeft(deadline: number): number {
  return deadline - Date.now();
}

/** News older than the stale window should never enter the pipeline. */
export function isStalePublishDate(
  publishedAt: Date,
  now: number = Date.now(),
): boolean {
  return now - publishedAt.getTime() > STALE_NEWS_MAX_AGE_MS;
}

// --- Text cleaning ------------------------------------------------------------
// Feed summaries arrive with HTML tags, numeric/named entities and (from some
// sources) UTF-8-read-as-latin1 mojibake. Everything below is pure string work
// so it is exported for unit tests and reused by the Hacker News sync.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
  raquo: "»",
  laquo: "«",
  middot: "·",
  bull: "•",
  deg: "°",
  euro: "€",
};

function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      safeFromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      safeFromCodePoint(parseInt(dec, 10)),
    )
    .replace(
      /&([a-z]+);/gi,
      (m: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m,
    );
}

// Windows-1252 codepoints that survive a bad latin1 decode as these chars; a
// true mojibake string contains ONLY latin1-range chars plus these. Anything
// else (e.g. a real "ş") means the text is fine and must not be touched.
const CP1252_REVERSE: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

function mojibakeMarkerCount(value: string): number {
  return (value.match(/Ã.|Â.|â€|Ä.|Å./g) || []).length;
}

export function repairMojibake(value: string): string {
  const before = mojibakeMarkerCount(value);
  if (before === 0) return value;

  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const cp = value.charCodeAt(i);
    if (cp <= 0xff) {
      bytes[i] = cp;
    } else if (CP1252_REVERSE[value[i]] !== undefined) {
      bytes[i] = CP1252_REVERSE[value[i]];
    } else {
      return value; // contains chars no mojibake string could have → leave as-is
    }
  }

  const repaired = Buffer.from(bytes).toString("utf8");
  if (repaired.includes("�")) return value; // invalid UTF-8 → wasn't mojibake
  return mojibakeMarkerCount(repaired) < before ? repaired : value;
}

export function cleanNewsText(value: string): string {
  const decoded = decodeEntities(
    value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "),
  );
  // Second tag pass: entity-escaped HTML (&lt;p&gt;) only becomes a tag after
  // decoding, so strip again before the mojibake repair.
  return repairMojibake(decoded.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// --- RSS parsing (regex-based; works for RSS2 and Atom) ----------------------

function cleanXMLText(value: string): string {
  return cleanNewsText(value);
}

export interface ParsedFeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

export function parseRSSItems(xml: string): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const itemRegex = /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = cleanXMLText(
      block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "",
    );
    const link = (
      block.match(/<link[^>]*href="([^"]+)"/)?.[1] ||
      cleanXMLText(block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] || "")
    ).trim();
    const description = cleanXMLText(
      block.match(
        /<(?:description|summary|content|content:encoded)[^>]*>([\s\S]*?)<\/(?:description|summary|content|content:encoded)>/,
      )?.[1] || "",
    ).slice(0, 1000);
    const pubDate = cleanXMLText(
      block.match(
        /<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/,
      )?.[1] || "",
    );

    if (title && link) items.push({ title, link, description, pubDate });
  }
  return items;
}

// --- Source seeding ----------------------------------------------------------
// First sync seeds the static list. feedUrl is @unique so re-seeding is a no-op.

// createMany + skipDuplicates (feedUrl @unique) makes this idempotent AND
// additive: brand-new default feeds are inserted on the next sync of an
// already-seeded DB, while existing rows (with their health stats) are untouched.
async function ensureSourcesSeeded(): Promise<void> {
  await prisma.newsSource.createMany({
    data: DEFAULT_SOURCES.map((s) => ({
      name: s.name,
      url: s.url,
      feedUrl: s.feedUrl,
      sourceType: s.sourceType,
      category: s.category,
      priority: s.priority,
      reliability: s.reliability,
      fetchIntervalMin: s.fetchIntervalMin,
    })),
    skipDuplicates: true,
  });
}

type DueSource = {
  id: string;
  name: string;
  feedUrl: string;
  category: string;
  errorCount: number;
  fetchIntervalMin: number;
  lastCheckedAt: Date | null;
};

function isSourceDue(s: DueSource, now: number): boolean {
  // Erroring sources get a cooldown instead of a permanent disable so feeds
  // self-heal after transient outages.
  if (s.errorCount >= SOURCE_ERROR_THRESHOLD) {
    if (
      s.lastCheckedAt &&
      now - s.lastCheckedAt.getTime() < SOURCE_ERROR_COOLDOWN_MS
    ) {
      return false;
    }
    return true;
  }
  if (!s.lastCheckedAt) return true;
  return now - s.lastCheckedAt.getTime() >= s.fetchIntervalMin * 60 * 1000;
}

// =============================================================================
// STAGE: sync — fetch due RSS feeds and insert raw NewsItems
// =============================================================================

export async function syncDueSources(
  deadline: number,
  opts: { maxSources?: number } = {},
): Promise<StageResult> {
  const maxSources = opts.maxSources ?? 8;
  const result: StageResult = { processed: 0, errors: 0, remaining: 0 };
  const now = Date.now();

  await ensureSourcesSeeded();

  const rssSources = await prisma.newsSource.findMany({
    where: { enabled: true, sourceType: "rss" },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
  });

  const due = rssSources.filter((s) => isSourceDue(s, now));
  result.remaining = due.length;

  // Dedupe against the last 7 days of fetched items.
  const recent = await prisma.newsItem.findMany({
    where: { fetchedAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } },
    select: { url: true, originalTitle: true },
  });
  const existingUrls = new Set(recent.map((n) => n.url));
  const existingTitles = new Set(
    recent.map((n) => n.originalTitle.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );

  for (const source of due.slice(0, maxSources)) {
    if (timeLeft(deadline) < 8000) break;

    try {
      const res = await fetch(source.feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 GrafikCem-XAgent/1.0",
          Accept:
            "application/rss+xml, application/xml, application/atom+xml, text/xml",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const xml = await res.text();
      const items = parseRSSItems(xml).slice(0, 10);

      for (const item of items) {
        const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (existingUrls.has(item.link) || existingTitles.has(normTitle))
          continue;

        const publishedAt =
          item.pubDate && !Number.isNaN(new Date(item.pubDate).getTime())
            ? new Date(item.pubDate)
            : new Date();
        // Dead content for X — don't even insert it (sweepStale is the backstop).
        if (isStalePublishDate(publishedAt, now)) continue;

        try {
          await prisma.newsItem.create({
            data: {
              newsSourceId: source.id,
              url: item.link,
              canonicalUrl: item.link,
              originalTitle: item.title,
              originalSummary: item.description,
              category: source.category,
              processingStatus: "raw",
              translationStatus: "pending",
              analysisStatus: "pending",
              publishedAt,
            },
          });
          existingUrls.add(item.link);
          existingTitles.add(normTitle);
          result.processed++;
        } catch {
          // Unique-url race with a concurrent tick: ignore.
        }
      }

      await prisma.newsSource.update({
        where: { id: source.id },
        data: {
          lastCheckedAt: new Date(),
          lastSuccessAt: new Date(),
          errorCount: 0,
          lastError: null,
        },
      });
      result.remaining--;
    } catch (err) {
      result.errors++;
      await prisma.newsSource.update({
        where: { id: source.id },
        data: {
          lastCheckedAt: new Date(),
          lastError: redactError(err).slice(0, 500),
          errorCount: source.errorCount + 1,
        },
      });
      result.remaining--;
    }
  }

  return result;
}

// =============================================================================
// STAGE: translate — raw → translated (TR title + summary)
// Turkish-source passthrough: items already in Turkish skip the LLM (otherwise
// the similarity validator rejects them as "untranslated leaks").
// =============================================================================

export async function translateBatch(
  deadline: number,
  batchLimit = 8,
): Promise<StageResult> {
  const result: StageResult = { processed: 0, errors: 0, remaining: 0 };

  result.remaining = await prisma.newsItem.count({
    where: { processingStatus: "raw" },
  });

  // Page through the backlog until it is empty or the deadline approaches.
  // Each processed item leaves "raw", so re-querying never repeats work.
  while (result.remaining > 0 && !result.deadlineHit) {
    if (timeLeft(deadline) < 10000) {
      result.deadlineHit = true;
      break;
    }

    const pending = await prisma.newsItem.findMany({
      where: { processingStatus: "raw" },
      orderBy: { fetchedAt: "desc" },
      take: batchLimit,
    });
    if (pending.length === 0) break;

    for (const item of pending) {
      if (timeLeft(deadline) < 10000) {
        result.deadlineHit = true;
        break;
      }

      const sourceLang = detectLanguage(item.originalTitle);
      if (sourceLang.isTurkish) {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: {
            trTitle: item.originalTitle,
            trSummary: item.originalSummary,
            lang: "tr",
            translationStatus: "success",
            processingStatus: "translated",
            modelUsed: "passthrough_turkish_source",
            errorMessage: null,
            lastAttemptedAt: new Date(),
          },
        });
        result.processed++;
        result.remaining--;
        continue;
      }

      const translation = await translateNews(
        item.originalTitle,
        item.originalSummary,
      );
      if (translation.success) {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: {
            trTitle: translation.trTitle,
            trSummary: translation.trSummary,
            lang: "tr",
            translationStatus: "success",
            processingStatus: "translated",
            modelUsed: translation.modelUsed,
            errorMessage: null,
            lastAttemptedAt: new Date(),
          },
        });
        result.processed++;
      } else {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: {
            translationStatus: "failed",
            processingStatus: "failed",
            errorMessage:
              translation.validationError || "Çeviri başarısız oldu",
            lastAttemptedAt: new Date(),
          },
        });
        result.errors++;
      }
      result.remaining--;
    }
  }

  return result;
}

// =============================================================================
// STAGE: analyze — translated → analyzed (5-criteria viral scoring)
// =============================================================================

export async function analyzeBatch(
  deadline: number,
  batchLimit = 8,
): Promise<StageResult> {
  const result: StageResult = { processed: 0, errors: 0, remaining: 0 };

  result.remaining = await prisma.newsItem.count({
    where: { processingStatus: "translated" },
  });

  // Cross-source corroboration corpus, loaded once per batch call: recent
  // headlines from any status — what matters is "did another outlet also
  // report this story", not where that copy sits in the pipeline.
  let verificationCorpus: VerificationCandidate[] = [];
  if (result.remaining > 0) {
    verificationCorpus = await prisma.newsItem.findMany({
      where: {
        fetchedAt: { gte: new Date(Date.now() - VERIFICATION_WINDOW_MS) },
        newsSourceId: { not: null },
      },
      select: { originalTitle: true, newsSourceId: true },
      orderBy: { fetchedAt: "desc" },
      take: VERIFICATION_CORPUS_LIMIT,
    });
  }

  while (result.remaining > 0 && !result.deadlineHit) {
    if (timeLeft(deadline) < 10000) {
      result.deadlineHit = true;
      break;
    }

    const pending = await prisma.newsItem.findMany({
      where: { processingStatus: "translated" },
      orderBy: { fetchedAt: "desc" },
      take: batchLimit,
    });
    if (pending.length === 0) break;

    for (const item of pending) {
      if (timeLeft(deadline) < 10000) {
        result.deadlineHit = true;
        break;
      }

      if (!item.trTitle) {
        // Lost its translation somehow — send back for re-translate.
        await prisma.newsItem.update({
          where: { id: item.id },
          data: { processingStatus: "raw", translationStatus: "pending" },
        });
        result.remaining--;
        continue;
      }

      const analysis = await scoreNews(item.trTitle, item.trSummary);
      if (analysis.success) {
        const score = analysis.xValueScore ?? 0;
        const isLowScore = score < LOW_SCORE_THRESHOLD;
        const sourceVerification = classifySourceVerification(
          { originalTitle: item.originalTitle, url: item.url, newsSourceId: item.newsSourceId },
          verificationCorpus,
        );
        await prisma.newsItem.update({
          where: { id: item.id },
          data: {
            viralScore: analysis.viralScore,
            xValueScore: analysis.xValueScore,
            whyPeopleCare: analysis.whyPeopleCare,
            tweetAngle: analysis.tweetAngle,
            suggestedFormat: analysis.suggestedFormat,
            sourceVerification,
            analysisStatus: "success",
            processingStatus: isLowScore ? "low_score" : "analyzed",
            modelUsed: analysis.modelUsed,
            errorMessage: isLowScore
              ? `Düşük skor: ${score} < ${LOW_SCORE_THRESHOLD} — arşivlendi`
              : null,
            lastAttemptedAt: new Date(),
          },
        });
        result.processed++;
      } else {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: {
            analysisStatus: "failed",
            processingStatus: "failed",
            errorMessage: analysis.validationError || "Analiz başarısız oldu",
            lastAttemptedAt: new Date(),
          },
        });
        result.errors++;
      }
      result.remaining--;
    }
  }

  return result;
}

// =============================================================================
// STAGE: enrichBuzz — compute the "çok konuşulan" buzzScore for the reader feed.
// Pulls external popularity (Hacker News + Reddit) ONCE per tick, matches it to
// recent items by URL, and combines it with cross-source corroboration + recency
// + source quality (computeBuzzScore). Fail-open: if external fetch is blocked
// (e.g. Reddit on a Vercel IP), buzz still computes from internal signals.
// =============================================================================

export async function enrichBuzz(
  deadline: number,
  opts: { maxItems?: number } = {},
): Promise<StageResult> {
  const maxItems = opts.maxItems ?? BUZZ_MAX_ITEMS;
  const result: StageResult = { processed: 0, errors: 0, remaining: 0 };
  if (timeLeft(deadline) < 4000) {
    result.deadlineHit = true;
    return result;
  }

  const items = await prisma.newsItem.findMany({
    where: {
      fetchedAt: { gte: new Date(Date.now() - BUZZ_WINDOW_MS) },
      processingStatus: { not: "quarantined" },
    },
    select: {
      id: true,
      url: true,
      canonicalUrl: true,
      publishedAt: true,
      fetchedAt: true,
      sourceVerification: true,
      newsSource: { select: { reliability: true, priority: true } },
    },
    orderBy: { fetchedAt: "desc" },
    take: maxItems,
  });
  result.remaining = items.length;
  if (items.length === 0) return result;

  // One external fetch per tick (both are no-throw → [] on failure).
  const [hn, reddit] = await Promise.all([
    fetchHackerNewsSignals(),
    fetchRedditSignals(),
  ]);
  const matched = matchSignalsToItems(items, [...hn, ...reddit]);
  const now = Date.now();

  for (const item of items) {
    if (timeLeft(deadline) < 3000) {
      result.deadlineHit = true;
      break;
    }
    const ext = matched.get(item.id);
    const buzzScore = computeBuzzScore({
      sourceVerification: item.sourceVerification,
      publishedAt: item.publishedAt,
      fetchedAt: item.fetchedAt,
      reliability: item.newsSource?.reliability ?? null,
      priority: item.newsSource?.priority ?? null,
      hnPoints: ext?.hnPoints ?? null,
      hnComments: ext?.hnComments ?? null,
      redditScore: ext?.redditScore ?? null,
      now,
    });
    try {
      await prisma.newsItem.update({
        where: { id: item.id },
        data: {
          buzzScore,
          hnPoints: ext?.hnPoints ?? null,
          hnComments: ext?.hnComments ?? null,
          redditScore: ext?.redditScore ?? null,
          externalSignalsAt: new Date(),
        },
      });
      result.processed++;
    } catch {
      result.errors++;
    }
    result.remaining--;
  }

  return result;
}

// =============================================================================
// sweepStuck — re-queue recent failures so the next ticks retry them. Uses
// lastAttemptedAt instead of a retry counter: items keep getting one retry per
// sweep until they age out of the 48h window.
// =============================================================================

export async function sweepStuck(limit = 20): Promise<{ requeued: number }> {
  const now = Date.now();
  const failed = await prisma.newsItem.findMany({
    where: {
      processingStatus: "failed",
      fetchedAt: { gte: new Date(now - STUCK_RETRY_WINDOW_MS) },
    },
    take: limit,
  });
  if (failed.length === 0) return { requeued: 0 };

  let requeued = 0;
  for (const item of failed) {
    const lastAttempt = item.lastAttemptedAt
      ? item.lastAttemptedAt.getTime()
      : 0;
    if (now - lastAttempt < STUCK_MIN_AGE_MS) continue;

    const target = item.translationStatus === "success" ? "translated" : "raw";
    await prisma.newsItem.update({
      where: { id: item.id },
      data: {
        processingStatus: target,
        translationStatus:
          item.translationStatus === "success" ? "success" : "pending",
        analysisStatus: "pending",
        errorMessage: null,
      },
    });
    requeued++;
  }
  return { requeued };
}

// =============================================================================
// sweepStale — quarantine pending items whose news value has expired. Items
// published over a week ago are dead content for X; translating/analyzing them
// burns LLM budget for nothing.
// =============================================================================

export async function sweepStale(): Promise<{ quarantined: number }> {
  const cutoff = new Date(Date.now() - STALE_NEWS_MAX_AGE_MS);
  const res = await prisma.newsItem.updateMany({
    where: {
      processingStatus: { in: ["raw", "translated"] },
      publishedAt: { lt: cutoff },
    },
    data: {
      processingStatus: "quarantined",
      errorMessage: "Bayat haber: 7 günden eski, otomatik karantina",
    },
  });
  return { quarantined: res.count };
}

// =============================================================================
// runPipelineTick — one budgeted pass over sync → translate → analyze.
// Cheap DB-only sweeps run first; then each stage gets a guaranteed budget
// slice so a large translate backlog never starves sync.
// =============================================================================

export async function runPipelineTick(budgetMs = 45_000): Promise<TickSummary> {
  const deadline = Date.now() + budgetMs;
  const errorMessages: string[] = [];

  const safeRun = async (
    name: string,
    fn: () => Promise<StageResult>,
  ): Promise<StageResult> => {
    try {
      return await fn();
    } catch (err) {
      errorMessages.push(
        `${name}: ${redactError(err)}`,
      );
      return { processed: 0, errors: 1, remaining: 0 };
    }
  };

  try {
    await sweepStale();
    await sweepStuck();
  } catch (err) {
    errorMessages.push(
      `sweep: ${redactError(err)}`,
    );
  }

  // Independent per-stage budgets anchored at call time: each share is a
  // fraction of the TOTAL budget, so an overrunning sync cannot starve
  // translate/analyze (the old cumulative math gave translate whatever was
  // left of a shared window — in short ticks that was zero).
  const stageDeadline = (share: number) =>
    Math.min(deadline, Date.now() + budgetMs * share);

  const sync = await safeRun("sync", () => syncDueSources(stageDeadline(0.2)));

  // Quarantine anything stale that the just-finished sync let through.
  try {
    await sweepStale();
  } catch (err) {
    errorMessages.push(
      `post-sync sweep: ${redactError(err)}`,
    );
  }

  const translate = await safeRun("translate", () =>
    translateBatch(stageDeadline(0.5)),
  );
  // Reserve the final budget slice for buzz enrichment so analyze can't eat it.
  const analyze = await safeRun("analyze", () => analyzeBatch(stageDeadline(0.85)));
  const buzz = await safeRun("buzz", () => enrichBuzz(deadline));

  if (translate.deadlineHit) {
    errorMessages.push(
      `translate: süre doldu, ${translate.remaining} item raw kaldı`,
    );
  }
  if (analyze.deadlineHit) {
    errorMessages.push(
      `analyze: süre doldu, ${analyze.remaining} item translated kaldı`,
    );
  }

  const remainingTotal =
    Math.max(0, sync.remaining) +
    Math.max(0, translate.remaining) +
    Math.max(0, analyze.remaining);

  return { sync, translate, analyze, buzz, remainingTotal, errorMessages };
}
