// Platform attribution helpers (Faz F — cross-platform learning core).
// Derive the owning platform of a learning row from its provenance fields so
// the weekly report and engagement loops can segment by platform. Shared by the
// repos (labeling NEW rows on write) and the one-time backfill (labeling
// HISTORICAL rows) so the mapping can never drift between the two.

export type LearningPlatform = "x" | "instagram" | "youtube";

/**
 * TrainingExample.platform from its inputType prefix.
 * yt_* (e.g. yt_brief) → youtube; ig_* (e.g. ig_reply, ig_dm) → instagram;
 * everything else (engagement_metric, generated drafts, ...) stays on x.
 */
export function deriveTrainingPlatform(inputType: string): LearningPlatform {
  if (inputType.startsWith("yt_")) return "youtube";
  if (inputType.startsWith("ig_")) return "instagram";
  return "x";
}

/**
 * ViralPattern.platform from its sourceType ("x | reddit | youtube | rss" or an
 * ig_ / yt_ mined source). reddit/rss feed the X account, so they stay on x.
 */
export function deriveViralPlatform(sourceType?: string | null): LearningPlatform {
  if (!sourceType) return "x";
  const s = sourceType.toLowerCase();
  if (s.startsWith("yt") || s === "youtube") return "youtube";
  if (s.startsWith("ig") || s === "instagram") return "instagram";
  return "x";
}
