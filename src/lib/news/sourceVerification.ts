import { normalizeTurkish } from "@/lib/utils/textSimilarity";

// Deterministic cross-source corroboration (no LLM cost): a story confirmed by
// other outlets is more trustworthy than a single-source claim. Computed at
// analysis time against the recent NewsItem corpus.
//
// Matching note: plain Jaccard punishes short titles (morphological variants
// like releases/released split the union) while still matching generic
// announcement pairs. We instead drop stopwords + generic news verbs and use
// the overlap coefficient (|∩| / min(|A|,|B|)) with a minimum of 2 shared
// content tokens — thresholds pinned by sourceVerification.test.ts fixtures.

export type SourceVerification =
  | "single_source"
  | "official_only"
  | "editorial_confirmed"
  | "multi_source_confirmed";

export type VerificationSubject = {
  originalTitle: string;
  url: string;
  newsSourceId: string | null;
};

export type VerificationCandidate = {
  originalTitle: string;
  newsSourceId: string | null;
};

// Vendor/official blogs: a no-corroboration story from these is an announcement,
// not an unverified rumor. Matched against the item URL hostname.
const OFFICIAL_DOMAINS = [
  "openai.com",
  "anthropic.com",
  "deepmind.google",
  "blog.google",
  "ai.google",
  "meta.com",
  "about.fb.com",
  "microsoft.com",
  "x.ai",
  "mistral.ai",
  "huggingface.co",
  "github.blog",
  "nvidia.com",
  "apple.com",
  "adobe.com",
  "figma.com",
];

// Articles/prepositions plus generic news verbs that appear in almost every
// headline; keeping them would let "X announces A" match "X announces B".
const TITLE_NOISE_TOKENS = new Set([
  // en stopwords
  "the", "a", "an", "of", "to", "with", "by", "for", "in", "on", "and", "or",
  "is", "are", "its", "it", "as", "at", "from", "after", "new", "now", "how",
  // generic news verbs
  "announces", "announced", "releases", "released", "release", "launches",
  "launched", "launch", "introduces", "introduced", "unveils", "unveiled",
  "says", "said", "reveals", "revealed", "gets", "brings",
  // tr equivalents
  "ve", "ile", "icin", "bir", "yeni", "duyurdu", "yayinladi", "tanitti",
]);

export const MIN_SHARED_TOKENS = 2;
export const OVERLAP_THRESHOLD = 0.6;

function contentTokens(title: string): Set<string> {
  return new Set(
    normalizeTurkish(title)
      .split(" ")
      .filter((t) => t.length > 1 && !TITLE_NOISE_TOKENS.has(t)),
  );
}

/** True when two headlines describe the same story (overlap coefficient). */
export function titlesMatch(titleA: string, titleB: string): boolean {
  const a = contentTokens(titleA);
  const b = contentTokens(titleB);
  if (a.size === 0 || b.size === 0) return false;

  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  if (shared < MIN_SHARED_TOKENS) return false;

  return shared / Math.min(a.size, b.size) >= OVERLAP_THRESHOLD;
}

export function isOfficialSourceUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export function classifySourceVerification(
  subject: VerificationSubject,
  candidates: VerificationCandidate[],
): SourceVerification {
  const matchedSources = new Set<string>();
  for (const candidate of candidates) {
    // Same-source repeats (including the subject row itself) are not corroboration.
    if (!candidate.newsSourceId || candidate.newsSourceId === subject.newsSourceId) continue;
    if (matchedSources.has(candidate.newsSourceId)) continue;
    if (titlesMatch(subject.originalTitle, candidate.originalTitle)) {
      matchedSources.add(candidate.newsSourceId);
    }
  }

  if (matchedSources.size >= 2) return "multi_source_confirmed";
  if (matchedSources.size === 1) return "editorial_confirmed";
  return isOfficialSourceUrl(subject.url) ? "official_only" : "single_source";
}
