/**
 * ReelPlan.notesJson versioned zarfı (Phase 3E, ADR-039 §7B). Geriye dönük
 * uyumlu: legacy düz `string[]` (assembler uyarıları) OKUNABİLİR kalır; yeni
 * yazımlar strict zarf üretir. Yeni migration YOK — mevcut String kolon.
 *
 * Zarf gerçek plan girdisini, revision'ı, fingerprint'i, uyarı/histogram
 * özetini ve uygulama meta'sını taşır → apply idempotency + audit.
 */

import { z } from "zod";

export const PLAN_NOTES_VERSION = "plan_notes.v1";

export const PlanInputSummarySchema = z
  .object({
    pillars: z.array(z.string()),
    postDays: z.array(z.number().int()),
    seriesKeys: z.array(z.string()),
    seasonalTopicsCount: z.number().int().min(0),
  })
  .strict();

export const PlanHistogramSummarySchema = z
  .object({
    topPillars: z.array(z.tuple([z.string(), z.number().int()])),
    topTools: z.array(z.tuple([z.string(), z.number().int()])),
    topicClusterCount: z.number().int().min(0),
  })
  .strict();

export const PlanNotesEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(PLAN_NOTES_VERSION),
    revision: z.number().int().min(1),
    fingerprint: z.string().min(1),
    input: PlanInputSummarySchema,
    warnings: z.array(z.string()),
    hardBlockers: z.array(z.string()),
    histogram: PlanHistogramSummarySchema,
    appliedAt: z.string().min(1),
    source: z.string().min(1), // "operator_apply" | "legacy_apply" | "handoff_consume"
    method: z.string().min(1), // "assembler.v2"
  })
  .strict();

export type PlanNotesEnvelope = z.infer<typeof PlanNotesEnvelopeSchema>;

export type ParsedPlanNotes = {
  /** Strict zarf (yeni format) veya null (legacy/bozuk). */
  envelope: PlanNotesEnvelope | null;
  /** Legacy string[] uyarıları veya zarf.warnings — UI için tek liste. */
  warnings: string[];
  /** Ham veri legacy string[] ise true. */
  legacy: boolean;
};

/**
 * notesJson'u fail-closed okur:
 *  - Versioned zarf → strict parse; başarısızsa null envelope + boş warnings.
 *  - Legacy JSON string[] → envelope null, warnings = liste, legacy=true.
 *  - Bozuk/boş → temiz boş.
 */
export function parsePlanNotes(raw: string | null | undefined): ParsedPlanNotes {
  if (!raw || raw.trim() === "") return { envelope: null, warnings: [], legacy: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { envelope: null, warnings: [], legacy: false };
  }
  // Legacy: düz string dizisi.
  if (Array.isArray(data)) {
    const warnings = data.filter((x): x is string => typeof x === "string");
    return { envelope: null, warnings, legacy: true };
  }
  const parsed = PlanNotesEnvelopeSchema.safeParse(data);
  if (parsed.success) {
    return { envelope: parsed.data, warnings: parsed.data.warnings, legacy: false };
  }
  return { envelope: null, warnings: [], legacy: false };
}

export function serializePlanNotes(envelope: PlanNotesEnvelope): string {
  return JSON.stringify(PlanNotesEnvelopeSchema.parse(envelope));
}

/** Legacy string[] → true (revision bump'ta önceki revision okunamaz → 0'dan başla). */
export function previousRevision(raw: string | null | undefined): number {
  const parsed = parsePlanNotes(raw);
  return parsed.envelope?.revision ?? 0;
}
