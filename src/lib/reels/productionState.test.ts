import { describe, it, expect } from "vitest";
import {
  computeEvidenceLayer,
  computeDossierProductionState,
  type ProductionStateInput,
  type VerificationRowInput,
} from "./productionState";
import type { CreativeReadiness } from "@/lib/reels/creativeReadiness";

/**
 * Production-state read model (ADR-038 §D): stored finalReadiness DEĞİL,
 * gerçek WebsiteVerification satırı + güncel durum türetimi. Katmanlar ayrı;
 * "bağlandı" ≠ "yayına hazır".
 */

const NOW = Date.parse("2026-07-18T12:00:00Z");
const TOOL_URL = "https://tool.example.com/";

function evidenceJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    opens: true,
    finalUrl: TOOL_URL,
    redirectChain: [],
    signupRequired: "unknown",
    freeTier: "unknown",
    usageLimits: "unknown",
    exportDownload: "unknown",
    commercialUse: "unknown",
    regionRestricted: "unknown",
    lastUpdated: "unknown",
    checkedAt: new Date(NOW - 3600_000).toISOString(),
    expiry: new Date(NOW + 10 * 86_400_000).toISOString(),
    ...overrides,
  });
}

function row(overrides: Partial<VerificationRowInput> = {}): VerificationRowInput {
  return {
    id: "wv-1",
    url: TOOL_URL,
    finalUrl: TOOL_URL,
    opens: true,
    redirectChain: "[]",
    evidenceJson: evidenceJson(),
    checkedAt: new Date(NOW - 3600_000),
    expiry: new Date(NOW + 10 * 86_400_000),
    ...overrides,
  };
}

const CREATIVE_READY: CreativeReadiness = { status: "ready_for_review", issues: [] };
const CREATIVE_EDIT: CreativeReadiness = {
  status: "needs_edit",
  issues: [{ code: "empty_caption", message: "Caption boş." }],
};

function input(overrides: Partial<ProductionStateInput> = {}): ProductionStateInput {
  return {
    toolNamed: true,
    primaryToolUrl: TOOL_URL,
    verificationId: "wv-1",
    verificationRow: row(),
    alternatives: [],
    alternativesParseFailed: false,
    creative: CREATIVE_READY,
    approved: true,
    trainingExampleId: "te-1",
    seriesContract: "none",
    attachedSlots: [{ slotId: "s1", month: "2026-07", dayOfMonth: 20, status: "drafted" }],
    nowMs: NOW,
    ...overrides,
  };
}

describe("computeEvidenceLayer — yalnız kalıcı satırdan", () => {
  it("araç yok → no_tool_required", () => {
    const e = computeEvidenceLayer({ toolNamed: false, primaryToolUrl: null, verificationId: null, verificationRow: null, nowMs: NOW });
    expect(e.state).toBe("no_tool_required");
  });

  it("verificationId yok → missing (kopyalanmış JSON kanıt sayılmaz)", () => {
    const e = computeEvidenceLayer({ toolNamed: true, primaryToolUrl: TOOL_URL, verificationId: null, verificationRow: null, nowMs: NOW });
    expect(e.state).toBe("missing");
    expect(e.reasons).toContain("no_persisted_verification");
  });

  it("id var ama satır bulunamadı → missing", () => {
    const e = computeEvidenceLayer({ toolNamed: true, primaryToolUrl: TOOL_URL, verificationId: "wv-1", verificationRow: null, nowMs: NOW });
    expect(e.state).toBe("missing");
    expect(e.reasons).toContain("verification_row_not_found");
  });

  it("evidenceJson strict parse edilemiyor → failed", () => {
    const e = computeEvidenceLayer({ toolNamed: true, primaryToolUrl: TOOL_URL, verificationId: "wv-1", verificationRow: row({ evidenceJson: "{corrupt" }), nowMs: NOW });
    expect(e.state).toBe("failed");
    expect(e.reasons).toContain("evidence_parse_failed");
  });

  it("kanıt BAŞKA URL için → missing (url_mismatch, fail-closed)", () => {
    const e = computeEvidenceLayer({
      toolNamed: true,
      primaryToolUrl: TOOL_URL,
      verificationId: "wv-1",
      verificationRow: row({ url: "https://baska.example.com/" }),
      nowMs: NOW,
    });
    expect(e.state).toBe("missing");
    expect(e.reasons).toContain("url_mismatch");
    expect(e.urlMatchesTool).toBe(false);
  });

  it("site açılmıyor → failed; expiry geçmiş → stale; taze → ready + sinyaller unknown", () => {
    expect(
      computeEvidenceLayer({ toolNamed: true, primaryToolUrl: TOOL_URL, verificationId: "wv-1", verificationRow: row({ opens: false, evidenceJson: evidenceJson({ opens: false }) }), nowMs: NOW }).state
    ).toBe("failed");
    expect(
      computeEvidenceLayer({ toolNamed: true, primaryToolUrl: TOOL_URL, verificationId: "wv-1", verificationRow: row({ expiry: new Date(NOW - 1000) }), nowMs: NOW }).state
    ).toBe("stale");
    const ready = computeEvidenceLayer({ toolNamed: true, primaryToolUrl: TOOL_URL, verificationId: "wv-1", verificationRow: row(), nowMs: NOW });
    expect(ready.state).toBe("ready");
    // Tier-1 dürüstlüğü: render sinyalleri unknown KALIR.
    expect(ready.signals?.freeTier).toBe("unknown");
    expect(ready.signals?.regionRestricted).toBe("unknown");
  });
});

describe("computeDossierProductionState — katmanlar + overall", () => {
  it("tüm kapılar + tek slot → production_ready", () => {
    const s = computeDossierProductionState(input());
    expect(s.productionReady).toBe(true);
    expect(s.overall).toBe("production_ready");
    expect(s.blockers).toEqual([]);
  });

  it("kapılar geçti ama slot bağlı değil → approved (bağlanabilir)", () => {
    const s = computeDossierProductionState(input({ attachedSlots: [] }));
    expect(s.productionReady).toBe(false);
    expect(s.overall).toBe("approved");
  });

  it("bağlı ama kanıt bayat → attached_not_ready + evidence_stale blocker", () => {
    const s = computeDossierProductionState(input({ verificationRow: row({ expiry: new Date(NOW - 1000) }) }));
    expect(s.productionReady).toBe(false);
    expect(s.overall).toBe("attached_not_ready");
    expect(s.blockers).toContain("evidence_stale");
  });

  it("bağlı değil + kanıt eksik → evidence_missing; başarısız → evidence_failed", () => {
    expect(
      computeDossierProductionState(input({ attachedSlots: [], verificationId: null, verificationRow: null })).overall
    ).toBe("evidence_missing");
    expect(
      computeDossierProductionState(
        input({ attachedSlots: [], verificationRow: row({ opens: false, evidenceJson: evidenceJson({ opens: false }) }) })
      ).overall
    ).toBe("evidence_failed");
  });

  it("creative needs_edit → creative_needs_edit; onay yok → awaiting_human_approval", () => {
    expect(
      computeDossierProductionState(input({ attachedSlots: [], creative: CREATIVE_EDIT })).overall
    ).toBe("creative_needs_edit");
    expect(
      computeDossierProductionState(input({ attachedSlots: [], approved: false, trainingExampleId: null })).overall
    ).toBe("awaiting_human_approval");
  });

  it("seri sözleşmesi değişti → asla production_ready", () => {
    const s = computeDossierProductionState(input({ seriesContract: "changed" }));
    expect(s.productionReady).toBe(false);
    expect(s.blockers).toContain("series_contract_changed");
  });

  it("aynı dossier birden fazla slota bağlı → multiAttached blocker, hazır DEĞİL", () => {
    const s = computeDossierProductionState(
      input({
        attachedSlots: [
          { slotId: "s1", month: "2026-07", dayOfMonth: 20, status: "drafted" },
          { slotId: "s2", month: "2026-07", dayOfMonth: 25, status: "drafted" },
        ],
      })
    );
    expect(s.productionReady).toBe(false);
    expect(s.layers.calendar.multiAttached).toBe(true);
    expect(s.blockers).toContain("multi_slot_attachment");
  });

  it("araç yok + kapılar geçti → no_tool_required kanıt katmanı, production_ready mümkün", () => {
    const s = computeDossierProductionState(
      input({ toolNamed: false, primaryToolUrl: null, verificationId: null, verificationRow: null })
    );
    expect(s.layers.evidence.state).toBe("no_tool_required");
    expect(s.productionReady).toBe(true);
  });

  it("alternatives parseFailed dürüstçe taşınır", () => {
    const s = computeDossierProductionState(input({ alternativesParseFailed: true }));
    expect(s.layers.alternatives.parseFailed).toBe(true);
  });
});
