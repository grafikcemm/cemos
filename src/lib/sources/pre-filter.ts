import type { AccountHandle } from "@/lib/accounts";
import { accountProfiles } from "@/lib/accounts";
import { NICHE_QUERIES } from "@/lib/sources/niche-queries";
import { generateJsonGated } from "@/lib/ai/generateGated";
import { getBudgetStatus } from "@/lib/config/costGate";
import type { NormalizedItem } from "@/lib/sources/types";

type PreFilterDecision = { id: string; decision: "YES" | "NO" };
type PreFilterResponse = { results?: PreFilterDecision[] };

const MAX_BATCH = 40;

function buildSystemPrompt(handle: AccountHandle): string {
  const profile = accountProfiles[handle];
  const keywords = NICHE_QUERIES[handle]?.keywords.join(", ") ?? "";
  // örn1 "宁滥勿缺 / keep loose, never miss" intent, persona-aware.
  return [
    `Sen keskin bir içerik seçicisin. Görevin @${handle} hesabı için potansiyel taşıyan içeriği KEŞFETMEK, eleme yapmak değil.`,
    `Hesap konsepti: ${profile.concept}`,
    `İlgili anahtar kelimeler: ${keywords}`,
    `Her içeriği değerlendir. Aşağıdakilerden HERHANGİ BİRİ doğruysa "YES" işaretle:`,
    `1) Güçlü kişisel görüş, duygu veya özgün deneyim içeriyor.`,
    `2) Tartışma veya çok kişili etkileşim doğurmuş.`,
    `3) Yeni bir soru veya farklı bir bakış açısı sunuyor.`,
    `4) Kısa olsa da yükselen bir trend veya "mem" sinyali olabilir.`,
    `Felsefe: "bol tut, kaçırma". İyi bir konu kıvılcımı varsa YES. Sadece saf reklam/spam NO.`,
    `Çıktı SADECE şu JSON: {"results":[{"id":"<id>","decision":"YES|NO"}]}`,
  ].join("\n");
}

function buildUserPrompt(items: NormalizedItem[]): string {
  const payload = items.map((it) => ({ id: it.externalId, content: it.text.slice(0, 280) }));
  return `İçerikler:\n${JSON.stringify(payload)}`;
}

export type PreFilterResult = {
  kept: NormalizedItem[];
  usedLlm: boolean;
  reason?: string;
};

/**
 * örn1 pre-filter. Fail-open by contract: when there is no API key, the budget
 * is spent, or the call errors, every item passes through (we'd rather store a
 * weak candidate than silently drop a viral one).
 */
export async function preFilterBatch(
  items: NormalizedItem[],
  handle: AccountHandle
): Promise<PreFilterResult> {
  if (items.length === 0) return { kept: [], usedLlm: false };

  if (!process.env.OPENROUTER_API_KEY) {
    return { kept: items, usedLlm: false, reason: "no_api_key" };
  }
  const budget = await getBudgetStatus();
  if (!budget.allowed) {
    return { kept: items, usedLlm: false, reason: "budget" };
  }

  const batch = items.slice(0, MAX_BATCH);
  try {
    const run = await generateJsonGated<PreFilterResponse>({
      role: "cheapWriter",
      system: buildSystemPrompt(handle),
      user: buildUserPrompt(batch),
      temperature: 0.2,
      purpose: "prefilter_source_batch",
    });
    const decisions = Array.isArray(run.data.results) ? run.data.results : [];
    if (decisions.length === 0) {
      return { kept: items, usedLlm: true, reason: "empty_decisions" };
    }
    const yes = new Set(
      decisions.filter((d) => String(d.decision).toUpperCase() === "YES").map((d) => d.id)
    );
    // Items beyond MAX_BATCH were not judged — keep them (fail-open).
    const kept = items.filter((it, idx) => idx >= MAX_BATCH || yes.has(it.externalId));
    return { kept, usedLlm: true };
  } catch {
    return { kept: items, usedLlm: false, reason: "llm_error" };
  }
}
