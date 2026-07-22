/**
 * A news sub-stage is "degraded" if it threw (its summary is `{error}`) or the
 * digest generation returned success:false. Used by the daily cron to flip the
 * run to PARTIAL so the health surface reads degraded instead of green when the
 * news subsystem is dead — the stages otherwise swallow their own errors and
 * never touch ok/partial, letting a fully-broken news pipeline report clean.
 */
export function newsStagesDegraded(news: Record<string, unknown> | undefined): boolean {
  if (!news) return false;
  if ("error" in news) return true;
  for (const stage of Object.values(news)) {
    if (stage && typeof stage === "object" && "error" in (stage as Record<string, unknown>)) {
      return true;
    }
  }
  const digest = news.digest as { success?: boolean } | undefined;
  return digest?.success === false;
}
