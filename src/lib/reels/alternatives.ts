/**
 * Alternatif araç zinciri sözleşmesi (ADR-038 §E) — SAF modül (DB/ağ yok).
 *
 * `ReelDossier.alternativesJson` artık versioned Zod zarfıdır. Kurallar:
 *  - En fazla MAX_ALTERNATIVES aktif alternatif.
 *  - Her alternatif KENDİ WebsiteVerification satırıyla doğrulanır; primary
 *    kanıtı alternatife KOPYALANAMAZ (verificationId alanı yalnız o alternatif
 *    için koşan doğrulamadan gelir).
 *  - Manuel "verified" işareti YOK — evidence durumu saklanan doğrulama
 *    gerçeklerinden TÜRETİLİR (`alternativeEvidenceState`).
 *  - Arşivleme non-destructive: status="archived" + archivedAt; fiziksel
 *    silme yok.
 *  - Alternatif primary'nin yerini SESSİZCE ALAMAZ: script/screen plan eski
 *    aracı anlatabilir. Güvenli yol = alternatifi YENİ dossier üretimine
 *    prefill etmek (ADR-036 kapısına tabi).
 *  - Zarf parse edilemiyorsa fail-closed boş liste + dürüst `parseFailed`
 *    bayrağı (legacy/bozuk veri sessizce "alternatif yok" gibi sunulmaz).
 */

import { z } from "zod";

export const ALTERNATIVES_SCHEMA_VERSION = "1";
export const MAX_ALTERNATIVES = 4;

const IsoDate = z.string().datetime({ offset: true }).or(z.string().datetime());

export const DossierAlternativeSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    submittedUrl: z.string().url().max(500),
    finalUrl: z.string().max(500).nullable(),
    verificationId: z.string().max(64).nullable(),
    opens: z.boolean().nullable(),
    checkedAt: IsoDate.nullable(),
    expiry: IsoDate.nullable(),
    status: z.enum(["active", "archived"]),
    archivedAt: IsoDate.nullable(),
    createdAt: IsoDate,
  })
  .strict();
export type DossierAlternative = z.infer<typeof DossierAlternativeSchema>;

export const AlternativesEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(ALTERNATIVES_SCHEMA_VERSION),
    alternatives: z.array(DossierAlternativeSchema).max(12),
  })
  .strict();
export type AlternativesEnvelope = z.infer<typeof AlternativesEnvelopeSchema>;

export type ParsedAlternatives = {
  alternatives: DossierAlternative[];
  /** true → alan doluydu ama zarf parse edilemedi (legacy/bozuk) — fail-closed boş. */
  parseFailed: boolean;
};

/** Fail-closed parse: geçersiz zarf → boş liste + dürüst bayrak. */
export function parseAlternatives(raw: string | null | undefined): ParsedAlternatives {
  if (!raw || raw.trim() === "" || raw.trim() === "[]" || raw.trim() === "{}") {
    return { alternatives: [], parseFailed: false };
  }
  try {
    const parsed = AlternativesEnvelopeSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { alternatives: parsed.data.alternatives, parseFailed: false };
    return { alternatives: [], parseFailed: true };
  } catch {
    return { alternatives: [], parseFailed: true };
  }
}

export function serializeAlternatives(alternatives: DossierAlternative[]): string {
  const envelope: AlternativesEnvelope = {
    schemaVersion: ALTERNATIVES_SCHEMA_VERSION,
    alternatives,
  };
  return JSON.stringify(AlternativesEnvelopeSchema.parse(envelope));
}

export type AlternativeEvidenceState = "unverified" | "ready" | "stale" | "failed";

/** Evidence durumu TÜRETİLİR — manuel işaret yok. */
export function alternativeEvidenceState(
  alt: Pick<DossierAlternative, "verificationId" | "opens" | "expiry">,
  nowMs: number
): AlternativeEvidenceState {
  if (!alt.verificationId) return "unverified";
  if (alt.opens === false) return "failed";
  if (alt.opens !== true) return "unverified"; // satır var ama açılış kanıtı yok
  if (alt.expiry && new Date(alt.expiry).getTime() < nowMs) return "stale";
  return "ready";
}

export function activeAlternatives(list: DossierAlternative[]): DossierAlternative[] {
  return list.filter((a) => a.status === "active");
}
