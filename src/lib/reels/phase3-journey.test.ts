import { describe, it, expect } from "vitest";
import { assembleMonthlyPlan } from "./plan-assembler";
import { reconcileSlots } from "./planReconcileService";
import {
  computeDossierProductionState,
  type ProductionStateInput,
  type VerificationRowInput,
} from "./productionState";
import type { CreativeReadiness } from "./creativeReadiness";
import { deriveInstagramPlanHealth, type PlanSlotHealth } from "@/lib/health/planHealthContract";

/**
 * PHASE 3 HERMETİK JOURNEY (ADR-039 §12) — SAF read-model zinciri:
 *   Fırsat/plan → preview reconcile → doğrulanmış+onaylı dossier attach →
 *   Phase 3D production-state → Phase 3E plan health READY → kanıt expiry
 *   simülasyonu → plan health WARN → "reverify" (taze kanıt) → READY.
 *
 * HERMETİK: yalnız saf fonksiyonlar — gerçek OpenRouter/Meta/site/DB YOK.
 * "Mock/deterministik geçti" ASLA "canlı doğrulandı" demek değildir. Cross-account,
 * concurrency ve retry senaryoları servis/contract testlerinde kapsanır
 * (planReconcileService.db, dossierProductionService, attach.contract).
 */

const NOW = Date.parse("2026-08-10T12:00:00.000Z");
const TOOL_URL = "https://tool.example.com/";
const PILLARS = ["arac_demo", "gorsel_uretim", "is_akisi"];

function evidenceJson(opts: { opens: boolean; expiryMs: number }): string {
  return JSON.stringify({
    opens: opts.opens,
    finalUrl: TOOL_URL,
    redirectChain: [],
    signupRequired: "unknown",
    freeTier: "unknown",
    usageLimits: "unknown",
    exportDownload: "unknown",
    commercialUse: "unknown",
    regionRestricted: "unknown",
    lastUpdated: "unknown",
    checkedAt: new Date(NOW - 86_400_000).toISOString(),
    expiry: new Date(opts.expiryMs).toISOString(),
  });
}

function verificationRow(opts: { opens: boolean; expiryMs: number }): VerificationRowInput {
  return {
    id: "wv-1",
    url: TOOL_URL,
    finalUrl: TOOL_URL,
    opens: opts.opens,
    redirectChain: "[]",
    evidenceJson: evidenceJson(opts),
    checkedAt: new Date(NOW - 86_400_000),
    expiry: new Date(opts.expiryMs),
  };
}

const CREATIVE_READY: CreativeReadiness = { status: "ready_for_review", issues: [] } as CreativeReadiness;

function productionInput(opts: { expiryMs: number; opens?: boolean }): ProductionStateInput {
  return {
    toolNamed: true,
    primaryToolUrl: TOOL_URL,
    verificationId: "wv-1",
    verificationRow: verificationRow({ opens: opts.opens ?? true, expiryMs: opts.expiryMs }),
    alternatives: [],
    alternativesParseFailed: false,
    creative: CREATIVE_READY,
    approved: true,
    trainingExampleId: "te-1",
    seriesContract: "none",
    attachedSlots: [{ slotId: "slot-raw-1", month: "2026-08", dayOfMonth: 10, status: "drafted" }],
    nowMs: NOW,
  };
}

function planSlotFromProduction(prod: ReturnType<typeof computeDossierProductionState>): PlanSlotHealth {
  return {
    slotId: "slot-raw-1",
    dayOfMonth: 10,
    status: "drafted",
    hasDossier: true,
    overall: prod.overall,
    productionReady: prod.productionReady,
    evidenceState: prod.layers.evidence.state,
  };
}

const PLAN = {
  accountId: "acc-1",
  month: "2026-08",
  status: "active" as const,
  warnings: [],
  hardBlockers: [],
  collisions: 0,
  mixDeviation: false,
  repetitionWarnings: 0,
};

describe("Phase 3 journey — plan → attach → health → expiry → reverify", () => {
  it("1) plan preview reconcile boş takvimde slot üretir", () => {
    const assembled = assembleMonthlyPlan({ month: "2026-08", postDays: [3, 6, 9, 12], pillars: PILLARS });
    const reconcile = reconcileSlots(assembled.slots, [], new Set());
    expect(reconcile.toCreate.length).toBe(4);
    expect(reconcile.toSkip).toHaveLength(0);
  });

  it("2) doğrulanmış+onaylı dossier attach → production_ready (Phase 3D)", () => {
    const prod = computeDossierProductionState(productionInput({ expiryMs: NOW + 30 * 86_400_000 }));
    expect(prod.overall).toBe("production_ready");
    expect(prod.productionReady).toBe(true);
  });

  it("3) plan health READY: production_ready slot → status ok", () => {
    const prod = computeDossierProductionState(productionInput({ expiryMs: NOW + 30 * 86_400_000 }));
    const health = deriveInstagramPlanHealth({
      plan: PLAN,
      slots: [planSlotFromProduction(prod)],
      todayDayOfMonth: 5,
    });
    expect(health.status).toBe("ok");
    expect(health.counts.productionReady).toBe(1);
  });

  it("4) kanıt expiry simülasyonu → evidence_stale, production_ready DÜŞER", () => {
    const prod = computeDossierProductionState(productionInput({ expiryMs: NOW - 86_400_000 }));
    expect(prod.layers.evidence.state).toBe("stale");
    expect(prod.productionReady).toBe(false);
    expect(prod.overall).toBe("attached_not_ready");
  });

  it("5) plan health WARN: bayat kanıt bugün → warn (outage değil)", () => {
    const prod = computeDossierProductionState(productionInput({ expiryMs: NOW - 86_400_000 }));
    const health = deriveInstagramPlanHealth({
      plan: PLAN,
      slots: [planSlotFromProduction(prod)],
      todayDayOfMonth: 10,
    });
    expect(health.status).toBe("warn");
    expect(health.status).not.toBe("error");
    expect(health.counts.evidenceStale).toBe(1);
    expect(health.todayUnready).toBe(1);
  });

  it("6) reverify (taze kanıt) → production_ready yeniden", () => {
    const prod = computeDossierProductionState(productionInput({ expiryMs: NOW + 30 * 86_400_000 }));
    expect(prod.overall).toBe("production_ready");
  });

  it("7) plan health tekrar READY", () => {
    const prod = computeDossierProductionState(productionInput({ expiryMs: NOW + 30 * 86_400_000 }));
    const health = deriveInstagramPlanHealth({
      plan: PLAN,
      slots: [planSlotFromProduction(prod)],
      todayDayOfMonth: 10,
    });
    expect(health.status).toBe("ok");
    expect(health.counts.productionReady).toBe(1);
  });

  it("bütünlük: aynı zincir deterministik (mock geçti ≠ canlı doğrulandı)", () => {
    const a = computeDossierProductionState(productionInput({ expiryMs: NOW + 30 * 86_400_000 }));
    const b = computeDossierProductionState(productionInput({ expiryMs: NOW + 30 * 86_400_000 }));
    expect(a).toEqual(b);
  });
});
