import { describe, it, expect } from "vitest";
import {
  deriveInstagramPlanHealth,
  type InstagramPlanHealthInput,
  type PlanSlotHealth,
} from "./planHealthContract";
import {
  deriveTopbar,
  type InfrastructureContract,
  type PipelineFreshnessContract,
  type TodayReadinessContract,
} from "./healthContracts";

function slot(p: Partial<PlanSlotHealth> & { slotId: string; dayOfMonth: number }): PlanSlotHealth {
  return {
    status: "planned",
    hasDossier: false,
    overall: null,
    productionReady: false,
    evidenceState: null,
    ...p,
  };
}
function plan(status: "draft" | "active" | "archived" = "active", extra: Record<string, unknown> = {}) {
  return {
    accountId: "acc-1",
    month: "2026-08",
    status,
    warnings: [],
    hardBlockers: [],
    collisions: 0,
    mixDeviation: false,
    repetitionWarnings: 0,
    ...extra,
  };
}

describe("deriveInstagramPlanHealth — anlam korkulukları", () => {
  it("plan yok → not_configured, status ok (kırmızı DEĞİL)", () => {
    const r = deriveInstagramPlanHealth({ plan: null, slots: [], todayDayOfMonth: null });
    expect(r.configured).toBe(false);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("opsiyonel");
  });

  it("veri alınamadı → unknown (healthy uydurmaz)", () => {
    const r = deriveInstagramPlanHealth({ plan: null, slots: [], todayDayOfMonth: null, dataUnavailable: true });
    expect(r.status).toBe("unknown");
  });

  it("draft boş plan → ok (eksik normal)", () => {
    const r = deriveInstagramPlanHealth({ plan: plan("draft"), slots: [], todayDayOfMonth: 5 });
    expect(r.status).toBe("ok");
    expect(r.message).toContain("Taslak");
  });

  it("archived plan → nötr ok", () => {
    const r = deriveInstagramPlanHealth({ plan: plan("archived"), slots: [], todayDayOfMonth: 5 });
    expect(r.status).toBe("ok");
    expect(r.message).toContain("arşiv");
  });

  it("meetsBar: dossier bağlı slot yoksa bar geçilmez (dürüst — Reels kanıt taşımıyor)", () => {
    const r = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [slot({ slotId: "s1", dayOfMonth: 5, hasDossier: false })],
      todayDayOfMonth: 1,
    });
    expect(r.meetsBar.ok).toBe(false);
    expect(r.meetsBar.attached).toBe(0);
    expect(r.meetsBar.reason).toContain("bağlı slot yok");
  });

  it("meetsBar: tüm bağlı slotlar yayına hazır → bar geçilir", () => {
    const r = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [
        slot({ slotId: "s1", dayOfMonth: 5, hasDossier: true, productionReady: true }),
        slot({ slotId: "s2", dayOfMonth: 6, hasDossier: true, productionReady: true }),
      ],
      todayDayOfMonth: 1,
    });
    expect(r.meetsBar.ok).toBe(true);
    expect(r.meetsBar.attached).toBe(2);
    expect(r.meetsBar.ready).toBe(2);
  });

  it("meetsBar: bir slot kanıt eksik → bar geçilmez + gerekçe listeler (site uydurulmaz)", () => {
    const r = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [
        slot({ slotId: "s1", dayOfMonth: 5, hasDossier: true, productionReady: true }),
        slot({ slotId: "s2", dayOfMonth: 6, hasDossier: true, productionReady: false, overall: "evidence_missing", evidenceState: "missing" }),
      ],
      todayDayOfMonth: 1,
    });
    expect(r.meetsBar.ok).toBe(false);
    expect(r.meetsBar.reason).toContain("Bar geçilmedi");
    expect(r.meetsBar.reason).toContain("kanıt");
  });

  it("active + bugün hazır olmayan slot → warn", () => {
    const input: InstagramPlanHealthInput = {
      plan: plan("active"),
      slots: [slot({ slotId: "s1", dayOfMonth: 10, hasDossier: false })],
      todayDayOfMonth: 10,
    };
    const r = deriveInstagramPlanHealth(input);
    expect(r.status).toBe("warn");
    expect(r.todayUnready).toBe(1);
    expect(r.nextActionable?.reason).toContain("dossier");
  });

  it("active + geçmiş tamamlanmamış slot → warn (overdue)", () => {
    const r = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [slot({ slotId: "s1", dayOfMonth: 3, status: "planned" })],
      todayDayOfMonth: 10,
    });
    expect(r.status).toBe("warn");
    expect(r.overdueIncomplete).toBe(1);
  });

  it("active + yaklaşan (7 gün) hazır olmayan → warn", () => {
    const r = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [slot({ slotId: "s1", dayOfMonth: 14, hasDossier: true, overall: "awaiting_human_approval" })],
      todayDayOfMonth: 10,
    });
    expect(r.status).toBe("warn");
    expect(r.next7DaysUnready).toBe(1);
    expect(r.counts.awaitingApproval).toBe(1);
  });

  it("bayat kanıt OUTAGE değil (warn, error değil)", () => {
    const r = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [slot({ slotId: "s1", dayOfMonth: 10, hasDossier: true, overall: "evidence_stale", evidenceState: "stale" })],
      todayDayOfMonth: 10,
    });
    expect(r.status).toBe("warn");
    expect(r.status).not.toBe("error");
    expect(r.counts.evidenceStale).toBe(1);
  });

  it("hepsi production_ready → ok", () => {
    const r = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [
        slot({ slotId: "s1", dayOfMonth: 10, status: "drafted", hasDossier: true, overall: "production_ready", productionReady: true }),
        slot({ slotId: "s2", dayOfMonth: 20, status: "done", hasDossier: true, overall: "production_ready", productionReady: true }),
      ],
      todayDayOfMonth: 5,
    });
    expect(r.status).toBe("ok");
    expect(r.counts.productionReady).toBe(2);
  });

  it("hard blocker → warn", () => {
    const r = deriveInstagramPlanHealth({
      plan: plan("active", { hardBlockers: ["Yasaklı konu"] }),
      slots: [],
      todayDayOfMonth: 5,
    });
    expect(r.status).toBe("warn");
    expect(r.blockers).toHaveLength(1);
  });

  it("skipped slotlar aktif sayıya girmez", () => {
    const r = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [
        slot({ slotId: "s1", dayOfMonth: 5, status: "skipped" }),
        slot({ slotId: "s2", dayOfMonth: 10, status: "drafted", hasDossier: true, overall: "production_ready", productionReady: true }),
      ],
      todayDayOfMonth: 1,
    });
    expect(r.counts.skippedSlots).toBe(1);
    expect(r.counts.totalActiveSlots).toBe(1);
  });
});

// ── Topbar önceliği (Instagram plan sinyali priority 5/6) ────────────────────
const infraOk: InfrastructureContract = { status: "ok", items: [] };
const infraErr: InfrastructureContract = { status: "error", items: [{ key: "database", label: "Veritabanı", status: "error" }] };
const pipeOk: PipelineFreshnessContract = { status: "ok", items: [], news: null };
const todayNeutral: TodayReadinessContract = { status: "ok", phase: "queue_completed", counts: null, message: "tamam" };

describe("deriveTopbar — Instagram plan sinyali", () => {
  it("planlama yapılandırılmamışsa topbar uyarı üretmez", () => {
    const ph = deriveInstagramPlanHealth({ plan: null, slots: [], todayDayOfMonth: null });
    const t = deriveTopbar(infraOk, pipeOk, todayNeutral, ph);
    expect(t.level).toBe("none");
  });

  it("aktif planın bugünkü slotu hazır değilse warn", () => {
    const ph = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [slot({ slotId: "s1", dayOfMonth: 10 })],
      todayDayOfMonth: 10,
    });
    const t = deriveTopbar(infraOk, pipeOk, todayNeutral, ph);
    expect(t.level).toBe("warn");
    expect(t.label).toContain("plan");
  });

  it("altyapı hatası plan sinyalini EZER (öncelik)", () => {
    const ph = deriveInstagramPlanHealth({
      plan: plan("active"),
      slots: [slot({ slotId: "s1", dayOfMonth: 10 })],
      todayDayOfMonth: 10,
    });
    const t = deriveTopbar(infraErr, pipeOk, todayNeutral, ph);
    expect(t.level).toBe("error");
  });

  it("draft plan topbar uyarısı üretmez", () => {
    const ph = deriveInstagramPlanHealth({
      plan: plan("draft"),
      slots: [slot({ slotId: "s1", dayOfMonth: 10 })],
      todayDayOfMonth: 10,
    });
    const t = deriveTopbar(infraOk, pipeOk, todayNeutral, ph);
    expect(t.level).toBe("none");
  });
});
