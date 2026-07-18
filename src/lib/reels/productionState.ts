/**
 * Dossier production-state read model (ADR-038 §D) — SAF, tek kaynaklı.
 *
 * ALTI KATMAN AYRI TAŞINIR, ASLA KARIŞMAZ:
 *  1. generation (dossier var — üretim çıktısı)
 *  2. primary evidence (kalıcı WebsiteVerification satırından TÜRETİLİR)
 *  3. alternative evidence (her alternatif kendi doğrulamasıyla)
 *  4. creative readiness (editoryal — ADR-036 §E)
 *  5. human approval (TrainingExample varlığı)
 *  6. calendar attachment (slot ilişkisi — "bağlandı" ≠ "yayına hazır")
 *
 * Stored `finalReadiness` yalnız snapshot/audit değeridir; güncel truth HER
 * OKUMADA buradan türetilir. UI ve API AYNI saf fonksiyonu kullanır.
 */

import type { CreativeReadiness } from "@/lib/reels/creativeReadiness";
import {
  VerificationEvidenceSchema,
  type VerificationEvidence,
} from "@/lib/verify/verifyWebsite";
import {
  alternativeEvidenceState,
  type AlternativeEvidenceState,
  type DossierAlternative,
} from "@/lib/reels/alternatives";

export const PRODUCTION_STATE_VERSION = "production_state.v1";

export type EvidenceLayerState =
  | "no_tool_required"
  | "ready"
  | "stale"
  | "missing"
  | "failed";

export type SeriesContractState = "none" | "valid" | "changed";

export type ProductionOverall =
  | "evidence_failed"
  | "evidence_missing"
  | "evidence_stale"
  | "creative_needs_edit"
  | "series_contract_changed"
  | "awaiting_human_approval"
  | "attached_not_ready"
  | "approved"
  | "production_ready";

export type VerificationRowInput = {
  id: string;
  url: string;
  finalUrl: string;
  opens: boolean;
  redirectChain: string;
  evidenceJson: string;
  checkedAt: Date | string;
  expiry: Date | string;
};

export type AttachedSlotInput = {
  slotId: string;
  month: string;
  dayOfMonth: number;
  status: string;
};

export type ProductionStateInput = {
  toolNamed: boolean;
  primaryToolUrl: string | null;
  /** Dossier'in işaret ettiği verificationId (yoksa null). */
  verificationId: string | null;
  /** verificationId'nin GERÇEK DB satırı (bulunamadıysa null — kopya JSON değil). */
  verificationRow: VerificationRowInput | null;
  alternatives: DossierAlternative[];
  alternativesParseFailed: boolean;
  creative: CreativeReadiness;
  approved: boolean;
  trainingExampleId: string | null;
  seriesContract: SeriesContractState;
  attachedSlots: AttachedSlotInput[];
  nowMs: number;
};

export type EvidenceLayer = {
  state: EvidenceLayerState;
  verificationId: string | null;
  submittedUrl: string | null;
  finalUrl: string | null;
  redirectChain: string[];
  checkedAt: string | null;
  expiry: string | null;
  opens: boolean | null;
  /** Doğrulanan URL, dossier'in primary tool URL'iyle aynı mı (fail-closed). */
  urlMatchesTool: boolean | null;
  reasons: string[];
};

export type AlternativeLayerItem = {
  id: string;
  name: string;
  submittedUrl: string;
  finalUrl: string | null;
  verificationId: string | null;
  evidenceState: AlternativeEvidenceState;
  checkedAt: string | null;
  expiry: string | null;
  status: "active" | "archived";
  archivedAt: string | null;
};

export type DossierProductionState = {
  version: typeof PRODUCTION_STATE_VERSION;
  layers: {
    generation: { state: "complete" };
    evidence: EvidenceLayer;
    alternatives: {
      items: AlternativeLayerItem[];
      activeCount: number;
      parseFailed: boolean;
    };
    creative: CreativeReadiness;
    approval: { approved: boolean; trainingExampleId: string | null };
    seriesContract: { state: SeriesContractState };
    calendar: {
      attachedSlotCount: number;
      slots: AttachedSlotInput[];
      multiAttached: boolean;
    };
  };
  blockers: string[];
  /** production_ready = TÜM kapılar + tam olarak BİR aktif slot bağlantısı. */
  productionReady: boolean;
  overall: ProductionOverall;
};

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function parseChain(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function strictEvidence(raw: string): VerificationEvidence | null {
  try {
    const parsed = VerificationEvidenceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Primary evidence katmanı — YALNIZ kalıcı WebsiteVerification satırından.
 * Kopyalanmış verificationEvidenceJson buraya girdi DEĞİLDİR (snapshot/audit).
 */
export function computeEvidenceLayer(input: {
  toolNamed: boolean;
  primaryToolUrl: string | null;
  verificationId: string | null;
  verificationRow: VerificationRowInput | null;
  nowMs: number;
}): EvidenceLayer {
  const empty: Omit<EvidenceLayer, "state" | "reasons"> = {
    verificationId: input.verificationId,
    submittedUrl: input.primaryToolUrl,
    finalUrl: null,
    redirectChain: [],
    checkedAt: null,
    expiry: null,
    opens: null,
    urlMatchesTool: null,
  };
  if (!input.toolNamed) {
    return { ...empty, state: "no_tool_required", reasons: [] };
  }
  if (!input.verificationId) {
    return { ...empty, state: "missing", reasons: ["no_persisted_verification"] };
  }
  const row = input.verificationRow;
  if (!row || row.id !== input.verificationId) {
    return { ...empty, state: "missing", reasons: ["verification_row_not_found"] };
  }
  const evidence = strictEvidence(row.evidenceJson);
  const base = {
    verificationId: row.id,
    submittedUrl: input.primaryToolUrl,
    finalUrl: row.finalUrl || null,
    redirectChain: parseChain(row.redirectChain),
    checkedAt: iso(row.checkedAt),
    expiry: iso(row.expiry),
    opens: row.opens,
    urlMatchesTool: input.primaryToolUrl !== null && row.url === input.primaryToolUrl,
  };
  if (!evidence) {
    return { ...base, state: "failed", reasons: ["evidence_parse_failed"] };
  }
  if (input.primaryToolUrl !== null && row.url !== input.primaryToolUrl) {
    // Kanıt başka URL için — bu araca ait kanıt YOK (fail-closed).
    return { ...base, state: "missing", reasons: ["url_mismatch"] };
  }
  if (!row.opens || !evidence.opens) {
    return { ...base, state: "failed", reasons: ["site_not_opening"] };
  }
  if (new Date(row.expiry).getTime() < input.nowMs) {
    return { ...base, state: "stale", reasons: ["evidence_expired"] };
  }
  return { ...base, state: "ready", reasons: [] };
}

export function computeDossierProductionState(
  input: ProductionStateInput
): DossierProductionState {
  const evidence = computeEvidenceLayer(input);

  const altItems: AlternativeLayerItem[] = input.alternatives.map((a) => ({
    id: a.id,
    name: a.name,
    submittedUrl: a.submittedUrl,
    finalUrl: a.finalUrl,
    verificationId: a.verificationId,
    evidenceState: alternativeEvidenceState(a, input.nowMs),
    checkedAt: a.checkedAt,
    expiry: a.expiry,
    status: a.status,
    archivedAt: a.archivedAt,
  }));
  const activeCount = altItems.filter((a) => a.status === "active").length;

  const multiAttached = input.attachedSlots.length > 1;

  const blockers: string[] = [];
  if (evidence.state === "failed") blockers.push("evidence_failed");
  if (evidence.state === "missing") blockers.push("evidence_missing");
  if (evidence.state === "stale") blockers.push("evidence_stale");
  if (input.creative.status !== "ready_for_review") blockers.push("creative_not_ready");
  if (input.seriesContract === "changed") blockers.push("series_contract_changed");
  if (!input.approved) blockers.push("awaiting_human_approval");
  if (multiAttached) blockers.push("multi_slot_attachment");

  const evidenceOk = evidence.state === "ready" || evidence.state === "no_tool_required";
  const gatesPass =
    evidenceOk &&
    input.creative.status === "ready_for_review" &&
    input.approved &&
    input.seriesContract !== "changed" &&
    !multiAttached;

  const attached = input.attachedSlots.length >= 1;
  const productionReady = gatesPass && attached;

  let overall: ProductionOverall;
  if (gatesPass) {
    overall = attached ? "production_ready" : "approved";
  } else if (attached) {
    // Bağlanmış ama hazır değil — bağlama planlama eylemidir, yayın onayı değil.
    overall = "attached_not_ready";
  } else if (evidence.state === "failed") {
    overall = "evidence_failed";
  } else if (evidence.state === "missing") {
    overall = "evidence_missing";
  } else if (evidence.state === "stale") {
    overall = "evidence_stale";
  } else if (input.creative.status !== "ready_for_review") {
    overall = "creative_needs_edit";
  } else if (input.seriesContract === "changed") {
    overall = "series_contract_changed";
  } else {
    overall = "awaiting_human_approval";
  }

  return {
    version: PRODUCTION_STATE_VERSION,
    layers: {
      generation: { state: "complete" },
      evidence,
      alternatives: {
        items: altItems,
        activeCount,
        parseFailed: input.alternativesParseFailed,
      },
      creative: input.creative,
      approval: { approved: input.approved, trainingExampleId: input.trainingExampleId },
      seriesContract: { state: input.seriesContract },
      calendar: {
        attachedSlotCount: input.attachedSlots.length,
        slots: input.attachedSlots,
        multiAttached,
      },
    },
    blockers,
    productionReady,
    overall,
  };
}
