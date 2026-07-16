import { z } from "zod";
import {
  curateOpportunities,
  opportunityScore,
  type OpportunityInput,
} from "@/lib/services/opportunityCuration";
import { AgentBlockedError } from "./types";

/**
 * Opportunity Curator sözleşmesi (ADR-027 §11).
 *
 * Deterministik `opportunityCuration` GÜVENLİ FALLBACK olarak korunur — bu
 * modül onu yeniden yazmaz, sarar. LLM kürasyon yolu typed olarak hazırdır ama
 * ENABLE_AGENT_CURATION=1 olmadan ASLA çağrılmaz (OpenRouter kredisi/izni yok
 * → blocked-external). Agent çıktısı giriş adaylarının DIŞINDAN kaynak/iddia
 * uyduramaz: her seçim `sourceId` ile giriş kümesine bağlanmak zorundadır;
 * uydurma sourceId output doğrulamasında reddedilir (fail-closed →
 * deterministik fallback).
 */

export const CuratorCandidateSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["news", "youtube", "radar", "discovery"]),
  title: z.string().min(1),
  whyNow: z.string().default(""),
  whyNowDetail: z.string().optional(),
  badge: z.string().default(""),
  badgeTone: z.enum(["accent", "muted", "yellow", "success"]).optional(),
  buzz: z.number().min(0).max(100).optional(),
  multiplier: z.number().min(0).optional(),
  insufficient: z.boolean().optional(),
  ageHours: z.number().min(0).optional(),
  personaFit: z.number().min(0).max(1).optional(),
  suggestedPlatform: z.enum(["X", "Instagram", "Reels", "YouTube"]),
  sourcePlatform: z.string().optional(),
  topicSeed: z.string().default(""),
  rawTab: z.string().default(""),
});
export type CuratorCandidate = z.infer<typeof CuratorCandidateSchema>;

export const CuratorInputSchema = z.object({
  candidates: z.array(CuratorCandidateSchema).min(1).max(200),
  limit: z.number().int().min(1).max(24).default(8),
  perSourceCap: z.number().int().min(1).max(12).default(4),
});
export type CuratorInput = z.infer<typeof CuratorInputSchema>;

/** §11: persona/tazelik/çeşitlilik/somutluk/risk gerekçeleri typed. */
export const CuratorReasonsSchema = z.object({
  personaFit: z.string().min(1),
  freshness: z.string().min(1),
  sourceDiversity: z.string().min(1),
  concreteness: z.string().min(1),
  risk: z.string().min(1),
});

export const CuratorSelectionSchema = z.object({
  /** Giriş adaylarından birinin id'si olmak ZORUNDA (aşağıda refine). */
  sourceId: z.string().min(1),
  score: z.number().min(0).max(100),
  reasons: CuratorReasonsSchema,
});

export const CuratorOutputSchema = z.object({
  method: z.enum(["deterministic", "agent"]),
  selections: z.array(CuratorSelectionSchema),
});
export type CuratorOutput = z.infer<typeof CuratorOutputSchema>;

/** Uydurulmuş/halüsinasyon sourceId'yi fail-closed reddeder. */
export function assertSelectionsBoundToInput(input: CuratorInput, output: CuratorOutput): void {
  const known = new Set(input.candidates.map((c) => c.id));
  const invalid = output.selections.filter((s) => !known.has(s.sourceId)).map((s) => s.sourceId);
  if (invalid.length > 0) {
    throw new Error(`Kürasyon çıktısı geçersiz sourceId içeriyor (giriş kümesinde yok): ${invalid.join(", ")}`);
  }
}

/** Deterministik yol — mevcut opportunityCuration'ı yeniden yazmadan sarar. */
export function runDeterministicCuration(input: CuratorInput): CuratorOutput {
  const asInputs: OpportunityInput[] = input.candidates.map((c) => ({ ...c }));
  const curated = curateOpportunities(asInputs, { limit: input.limit, perSourceCap: input.perSourceCap });
  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  return {
    method: "deterministic",
    selections: curated.map((o) => {
      const c = byId.get(o.id);
      const fresh = typeof c?.ageHours === "number" ? `${Math.round(c.ageHours)} saat` : "yaş bilinmiyor";
      return {
        sourceId: o.id,
        score: o.score,
        reasons: {
          personaFit: `Deterministik persona ağırlığı ${(c?.personaFit ?? 0.6).toFixed(2)}`,
          freshness: `Tazelik girdisi: ${fresh} (72s penceresi)`,
          sourceDiversity: `Kaynak-başına tavan ${input.perSourceCap} uygulandı (${o.source})`,
          concreteness: c?.insufficient
            ? "Yetersiz örneklem işaretli — çarpan şişirilmedi"
            : "Skor yalnız gözlenen buzz/çarpan girdilerinden",
          risk: "Deterministik yol iddia üretmez — risk değerlendirmesi readiness kapısında",
        },
      };
    }),
  };
}

export function isAgentCurationEnabled(): boolean {
  return process.env.ENABLE_AGENT_CURATION === "1";
}

/**
 * LLM kürasyon yolu — YALNIZ ENABLE_AGENT_CURATION=1 iken çalışır; aksi halde
 * AgentBlockedError (ağ çağrısı YOK). Aktifken: adaylar wrapUntrustedData ile
 * çitlenir, çıktı CuratorOutputSchema + sourceId bağlaması ile doğrulanır.
 */
export async function runAgentCuration(input: CuratorInput): Promise<CuratorOutput> {
  if (!isAgentCurationEnabled()) {
    throw new AgentBlockedError(
      "curation_agent_disabled",
      "LLM kürasyonu kapalı — OpenRouter kredi/izin onayı yok (ENABLE_AGENT_CURATION)."
    );
  }
  const { generateJsonGated } = await import("@/lib/ai/generateGated");
  const { wrapUntrustedData, UNTRUSTED_DATA_NOTICE } = await import("@/lib/ai/untrustedData");
  const candidatePayload = input.candidates.map((c) => ({
    id: c.id,
    source: c.source,
    title: c.title,
    whyNow: c.whyNow,
    buzz: c.buzz ?? null,
    multiplier: c.multiplier ?? null,
    insufficient: c.insufficient ?? false,
    ageHours: c.ageHours ?? null,
    personaFit: c.personaFit ?? null,
    suggestedPlatform: c.suggestedPlatform,
    deterministicScore: opportunityScore({ ...c }),
  }));
  const r = await generateJsonGated<{ selections: Array<z.infer<typeof CuratorSelectionSchema>> }>({
    preset: "cemos-research",
    system: [
      "Sen CemOS fırsat küratörüsün. SADECE verilen aday listesinden seç.",
      "Listede olmayan id, kaynak veya iddia ÜRETME. Her seçim için persona uyumu,",
      "tazelik, kaynak çeşitliliği, somutluk ve risk gerekçesini tek cümleyle yaz.",
      UNTRUSTED_DATA_NOTICE,
    ].join("\n"),
    user: [
      `En fazla ${input.limit} fırsat seç (kaynak başına ≤${input.perSourceCap}).`,
      `JSON dön: {"selections":[{"sourceId","score","reasons":{"personaFit","freshness","sourceDiversity","concreteness","risk"}}]}`,
      wrapUntrustedData(JSON.stringify(candidatePayload)),
    ].join("\n"),
    purpose: "research_opportunity_curation",
  });
  const parsed = CuratorOutputSchema.parse({ method: "agent", selections: r.data?.selections ?? [] });
  assertSelectionsBoundToInput(input, parsed);
  if (parsed.selections.length > input.limit) {
    parsed.selections = parsed.selections.slice(0, input.limit);
  }
  return parsed;
}
