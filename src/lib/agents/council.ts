import { generateJsonGated } from "@/lib/ai/generateGated";
import { getBudgetStatus } from "@/lib/config/costGate";
import { X_COUNCIL_SPEC } from "./council-config";

/**
 * The deliberation council. Four independent lens-agents each judge a candidate
 * from a distinct angle; a deterministic synthesis reconciles them into one
 * ranked verdict. This is the user's "müzakere" core: many small agents argue,
 * the engine decides which content works better — and it never crashes (every
 * lens is fail-open with a neutral default).
 */

export type Lens = "hook" | "persona" | "risk" | "novelty";
export const LENSES: Lens[] = X_COUNCIL_SPEC.lenses.map((l) => l.lens as Lens);

export type LensVerdict = { lens: Lens; score: number; argument: string };
export type CouncilVerdict = {
  score: number; // 0–100 weighted
  verdict: "strong" | "maybe" | "weak";
  lenses: LensVerdict[];
  rationale: string;
  usedLlm: boolean;
};

// "risk" lens reports SAFETY (100 = safe, 0 = dangerous), so high is always good.
// Derived from X_COUNCIL_SPEC so all lens config lives in one place (data).
const LENS_WEIGHTS: Record<string, number> = Object.fromEntries(
  X_COUNCIL_SPEC.lenses.map((l) => [l.lens, l.weight])
);

const LENS_DEFAULT_SCORE: Record<string, number> = Object.fromEntries(
  X_COUNCIL_SPEC.lenses.map((l) => [l.lens, l.defaultScore])
);

function defaultVerdict(lens: Lens): LensVerdict {
  return { lens, score: LENS_DEFAULT_SCORE[lens], argument: "fail-open default" };
}

/** Pure reconciliation — exported for testing. */
export function synthesize(lenses: LensVerdict[], usedLlm = false): CouncilVerdict {
  if (lenses.length === 0) {
    return { score: 0, verdict: "weak", lenses, rationale: "no verdicts", usedLlm };
  }
  let total = 0;
  let wsum = 0;
  for (const l of lenses) {
    const w = LENS_WEIGHTS[l.lens] ?? 0.25;
    total += Math.max(0, Math.min(100, l.score)) * w;
    wsum += w;
  }
  const score = Math.round(wsum > 0 ? total / wsum : 0);
  const verdict =
    score >= X_COUNCIL_SPEC.strongAt ? "strong" : score >= X_COUNCIL_SPEC.maybeAt ? "maybe" : "weak";
  const rationale = lenses.map((l) => `${l.lens}:${Math.round(l.score)}`).join(" · ");
  return { score, verdict, lenses, rationale, usedLlm };
}

function lensInstruction(lens: Lens, handle: string): string {
  const spec = X_COUNCIL_SPEC.lenses.find((l) => l.lens === lens);
  return spec ? spec.buildInstruction(handle) : "";
}

async function scoreLens(lens: Lens, text: string, handle: string): Promise<LensVerdict> {
  try {
    const run = await generateJsonGated<{ score?: number; argument?: string }>({
      role: "cheapWriter",
      system: `Sen tek mercekli bir içerik jürisisin. ${lensInstruction(lens, handle)} Çıktı SADECE JSON: {"score":<0-100>,"argument":"<tek cümle>"}`,
      user: `İçerik:\n"""${text.slice(0, 500)}"""`,
      temperature: 0.2,
      purpose: "judge_council_lens",
      meta: { lens },
    });
    const score = typeof run.data.score === "number" ? run.data.score : LENS_DEFAULT_SCORE[lens];
    return { lens, score: Math.max(0, Math.min(100, score)), argument: run.data.argument ?? "" };
  } catch {
    return defaultVerdict(lens);
  }
}

/**
 * Run the full council for one candidate against one account. Fail-open: with
 * no API key or an exhausted budget it returns a neutral synthesized verdict
 * instead of throwing, so mining never aborts.
 */
export async function deliberate(text: string, handle: string): Promise<CouncilVerdict> {
  if (!process.env.OPENROUTER_API_KEY) {
    return synthesize(LENSES.map(defaultVerdict), false);
  }
  const budget = await getBudgetStatus();
  if (!budget.allowed) {
    return synthesize(LENSES.map(defaultVerdict), false);
  }
  const settled = await Promise.allSettled(LENSES.map((l) => scoreLens(l, text, handle)));
  const verdicts = settled.map((s, i) => (s.status === "fulfilled" ? s.value : defaultVerdict(LENSES[i])));
  return synthesize(verdicts, true);
}
