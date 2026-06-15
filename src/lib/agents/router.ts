import { accountList, type AccountHandle } from "@/lib/accounts";
import { generateJson } from "@/lib/ai/openrouter";
import { getBudgetStatus } from "@/lib/config/costGate";

/**
 * Routing agent: decides which of the 3 accounts a piece of external content
 * fits best ("hangi içerik hangi hesaba"). Fail-open: with no key / spent budget
 * / error it returns an empty routing (callers keep the item for the account
 * that discovered it).
 */

export type AccountFit = { account: AccountHandle; fitScore: number; reason: string };
export type RouteResult = {
  best: AccountHandle | null;
  fits: AccountFit[];
  usedLlm: boolean;
};

const VALID = new Set<string>(accountList.map((a) => a.handle));

function buildPrompt(): string {
  const lines = accountList.map((a) => `- ${a.handle}: ${a.persona} — ${a.concept}`);
  return [
    "Sen bir içerik yönlendirme ajanısın. Verilen dış içeriğin aşağıdaki 3 X hesabından hangisine ne kadar uyduğunu puanla (0-100).",
    ...lines,
    "Hiçbirine uymuyorsa hepsine düşük puan ver.",
    `Çıktı SADECE JSON: {"fits":[{"account":"<handle>","fitScore":<0-100>,"reason":"<kısa>"}]}`,
  ].join("\n");
}

/** Pure: pick best valid fit above a floor. Exported for testing. */
export function pickBest(fits: AccountFit[], floor = 45): { best: AccountHandle | null; fits: AccountFit[] } {
  const valid = fits
    .filter((f) => VALID.has(f.account))
    .map((f) => ({ ...f, fitScore: Math.max(0, Math.min(100, f.fitScore)) }))
    .sort((a, b) => b.fitScore - a.fitScore);
  const top = valid[0];
  return { best: top && top.fitScore >= floor ? top.account : null, fits: valid };
}

export async function routeItem(text: string): Promise<RouteResult> {
  if (!process.env.OPENROUTER_API_KEY) {
    return { best: null, fits: [], usedLlm: false };
  }
  const budget = await getBudgetStatus();
  if (!budget.allowed) {
    return { best: null, fits: [], usedLlm: false };
  }
  try {
    const run = await generateJson<{ fits?: AccountFit[] }>({
      role: "cheapWriter",
      system: buildPrompt(),
      user: `İçerik:\n"""${text.slice(0, 500)}"""`,
      temperature: 0.2,
    });
    const fits = Array.isArray(run.data.fits) ? run.data.fits : [];
    const picked = pickBest(fits);
    return { ...picked, usedLlm: true };
  } catch {
    return { best: null, fits: [], usedLlm: false };
  }
}
