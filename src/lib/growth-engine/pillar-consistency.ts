/**
 * Pillar consistency (Faz D) — the article's "Trust" idea: an account known for
 * ONE valuable thing gets remembered (and priced); one that posts ten random
 * things cannot. This measures how concentrated an account's output is across
 * its content pillars (mode ids), so the loop can nudge "stay on the winning
 * pillar." Pure function over data the queue already has — no external calls.
 */

export type PillarStat = { pillar: string; count: number; pct: number };
export type PillarVerdict = "odakli" | "dengeli" | "dagilmis";

export type PillarConsistency = {
  total: number;
  /** Share of the single most-used pillar (0-100). */
  focusPct: number;
  /** Herfindahl concentration index (0-1; 1 = single pillar). */
  herfindahl: number;
  verdict: PillarVerdict;
  distribution: PillarStat[];
  /** Up to 3 distinct modes used that are NOT among the account's known pillars. */
  offPillarSample: string[];
};

const FOCUS_THRESHOLD = 50; // >= odaklı
const BALANCED_THRESHOLD = 30; // >= dengeli, else dağılmış

function verdictFor(focusPct: number): PillarVerdict {
  if (focusPct >= FOCUS_THRESHOLD) return "odakli";
  if (focusPct >= BALANCED_THRESHOLD) return "dengeli";
  return "dagilmis";
}

export function computePillarConsistency(input: {
  items: Array<{ mode: string }>;
  knownPillars: string[];
}): PillarConsistency {
  const total = input.items.length;
  if (total === 0) {
    return { total: 0, focusPct: 0, herfindahl: 0, verdict: "dengeli", distribution: [], offPillarSample: [] };
  }

  const counts = new Map<string, number>();
  for (const it of input.items) {
    const mode = it.mode || "unknown";
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }

  const distribution: PillarStat[] = Array.from(counts.entries())
    .map(([pillar, count]) => ({ pillar, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  const focusPct = distribution[0]?.pct ?? 0;
  const herfindahl = Math.round(
    Array.from(counts.values()).reduce((sum, c) => sum + (c / total) ** 2, 0) * 1000,
  ) / 1000;

  const known = new Set(input.knownPillars);
  const offPillarSample = distribution
    .map((d) => d.pillar)
    .filter((p) => !known.has(p))
    .slice(0, 3);

  return { total, focusPct, herfindahl, verdict: verdictFor(focusPct), distribution, offPillarSample };
}
