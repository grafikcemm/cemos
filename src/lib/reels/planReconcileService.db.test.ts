import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Plan preview/apply/lifecycle servisi (ADR-039 §7) — mocked prisma:
 *  - fingerprint mismatch / stale / archived fail-closed
 *  - non-destructive reconcile (deleteMany YOK; obsolete → updateMany skipped)
 *  - idempotent no-op; first-create; tx-içi yarış → stale
 *  - lifecycle draft→active ack; invalid; stale
 *  - series DB-resolution (client truth değil)
 */

const txMock = {
  $queryRaw: vi.fn(() => Promise.resolve([])),
  reelPlan: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  reelPlanSlot: {
    findMany: vi.fn(() => Promise.resolve([])),
    createMany: vi.fn(() => Promise.resolve({ count: 0 })),
    update: vi.fn(() => Promise.resolve({})),
    updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
  },
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    reelPlan: { findUnique: vi.fn(), findMany: vi.fn(() => Promise.resolve([])) },
    reelPlanSlot: { findMany: vi.fn(() => Promise.resolve([])) },
    opportunityHandoff: { findMany: vi.fn(() => Promise.resolve([])) },
    reelDossier: { findMany: vi.fn(() => Promise.resolve([])) },
    seriesProfile: { findMany: vi.fn(() => Promise.resolve([])) },
  },
}));

import { prisma } from "@/lib/db/client";
import {
  applyPlan,
  transitionPlanStatus,
  resolveSeriesForPlan,
  computePlanPreview,
  fingerprintPlanInput,
} from "./planReconcileService";

const ACC = "acc-1";
const MONTH = "2026-08";
const UPDATED = new Date("2026-08-01T09:00:00.000Z");
const PILLARS = ["a", "b", "c"];

type SlotRow = {
  id: string;
  dayOfMonth: number;
  pillar: string;
  mixBucket: string;
  seriesKey: string | null;
  topicHint: string;
  status: string;
  dossierId: string | null;
};
function slotRow(p: Partial<SlotRow> & { id: string; dayOfMonth: number }): SlotRow {
  return {
    pillar: "a",
    mixBucket: "evergreen",
    seriesKey: null,
    topicHint: "",
    status: "planned",
    dossierId: null,
    ...p,
  };
}

const mockPlanFind = vi.mocked(prisma.reelPlan.findUnique);
const mockSlotFind = vi.mocked(prisma.reelPlanSlot.findMany);

function configureExistingPlan(opts: {
  status?: string;
  slots?: SlotRow[];
  notesJson?: string;
  updatedAt?: Date;
}) {
  const updatedAt = opts.updatedAt ?? UPDATED;
  mockPlanFind.mockResolvedValue({
    id: "plan-1",
    status: opts.status ?? "draft",
    updatedAt,
    notesJson: opts.notesJson ?? "[]",
  } as never);
  const slotImpl = (args: { where?: { planId?: unknown } }) => {
    const planId = args?.where?.planId;
    return Promise.resolve(typeof planId === "string" ? opts.slots ?? [] : []);
  };
  mockSlotFind.mockImplementation(slotImpl as never);
  txMock.reelPlan.findUnique.mockResolvedValue({ id: "plan-1", updatedAt, status: opts.status ?? "draft" });
  txMock.reelPlanSlot.findMany.mockResolvedValue((opts.slots ?? []) as never);
  txMock.reelPlan.update.mockResolvedValue({ updatedAt: new Date(updatedAt.getTime() + 1000), status: opts.status ?? "draft" });
}

function configureNoPlan() {
  mockPlanFind.mockResolvedValue(null as never);
  mockSlotFind.mockResolvedValue([] as never);
  txMock.reelPlan.create.mockResolvedValue({ id: "plan-new" });
  txMock.reelPlanSlot.findMany.mockResolvedValue([]);
  txMock.reelPlan.update.mockResolvedValue({ updatedAt: new Date("2026-08-02T00:00:00Z"), status: "draft" });
}

const SIMPLE_PLAN = { pillars: PILLARS, postDays: [3] };
function fp(plan = SIMPLE_PLAN) {
  return fingerprintPlanInput(ACC, MONTH, plan);
}

beforeEach(() => {
  vi.clearAllMocks();
  txMock.$queryRaw.mockResolvedValue([]);
  txMock.reelPlanSlot.createMany.mockResolvedValue({ count: 0 });
  txMock.reelPlanSlot.updateMany.mockResolvedValue({ count: 0 });
  txMock.reelPlanSlot.update.mockResolvedValue({});
});

describe("applyPlan — güvenlik/concurrency", () => {
  it("fingerprint mismatch → 409 kodu, DB'ye dokunmaz", async () => {
    const r = await applyPlan({
      accountId: ACC,
      month: MONTH,
      plan: SIMPLE_PLAN,
      fingerprint: "WRONG",
      expectedUpdatedAt: UPDATED.toISOString(),
      nowIso: "2026-08-01T10:00:00Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("fingerprint_mismatch");
    expect(prisma.reelPlan.findUnique).not.toHaveBeenCalled();
  });

  it("expectedUpdatedAt uyuşmazsa stale", async () => {
    configureExistingPlan({ slots: [] });
    const r = await applyPlan({
      accountId: ACC,
      month: MONTH,
      plan: SIMPLE_PLAN,
      fingerprint: fp(),
      expectedUpdatedAt: new Date("2020-01-01").toISOString(),
      nowIso: "2026-08-01T10:00:00Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("stale");
  });

  it("archived plana apply reddedilir", async () => {
    configureExistingPlan({ status: "archived", slots: [] });
    const r = await applyPlan({
      accountId: ACC,
      month: MONTH,
      plan: SIMPLE_PLAN,
      fingerprint: fp(),
      expectedUpdatedAt: UPDATED.toISOString(),
      nowIso: "2026-08-01T10:00:00Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("archived_plan");
  });

  it("ilk apply: plan yoksa oluşturur + slot createMany", async () => {
    configureNoPlan();
    const r = await applyPlan({
      accountId: ACC,
      month: MONTH,
      plan: SIMPLE_PLAN,
      fingerprint: fp(),
      expectedUpdatedAt: null,
      nowIso: "2026-08-01T10:00:00Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(1);
    expect(txMock.reelPlan.create).toHaveBeenCalled();
    expect(txMock.reelPlanSlot.createMany).toHaveBeenCalled();
  });

  it("NON-DESTRUCTIVE: obsolete planned slot updateMany ile skipped'e geçer (deleteMany yok)", async () => {
    configureExistingPlan({ slots: [slotRow({ id: "obsolete", dayOfMonth: 20 })] });
    const r = await applyPlan({
      accountId: ACC,
      month: MONTH,
      plan: SIMPLE_PLAN,
      fingerprint: fp(),
      expectedUpdatedAt: UPDATED.toISOString(),
      nowIso: "2026-08-01T10:00:00Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.skipped).toBe(1);
    expect(txMock.reelPlanSlot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "skipped" } })
    );
    // Servis hiçbir yerde deleteMany çağırmaz (mock'ta tanımlı bile değil).
    expect((txMock.reelPlanSlot as Record<string, unknown>).deleteMany).toBeUndefined();
  });

  it("idempotent no-op: aynı slot varken create/update/skip yok", async () => {
    // Assembler day3 için evergreen pillar 'a' üretir; birebir mevcut.
    configureExistingPlan({
      slots: [slotRow({ id: "m1", dayOfMonth: 3, pillar: "a", mixBucket: "evergreen", topicHint: "" })],
    });
    const r = await applyPlan({
      accountId: ACC,
      month: MONTH,
      plan: SIMPLE_PLAN,
      fingerprint: fp(),
      expectedUpdatedAt: UPDATED.toISOString(),
      nowIso: "2026-08-01T10:00:00Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.idempotent).toBe(true);
      expect(r.created).toBe(0);
      expect(r.updated).toBe(0);
      expect(r.skipped).toBe(0);
    }
    expect(txMock.reelPlanSlot.createMany).not.toHaveBeenCalled();
  });

  it("hard blocker (yasaklı konu) → 422 hard_blocked, yazma yok", async () => {
    configureExistingPlan({ slots: [] });
    const plan = { pillars: PILLARS, postDays: [1, 5, 9, 13], seasonalTopics: ["yasak konu"], bannedRepetition: ["yasak konu"] };
    const r = await applyPlan({
      accountId: ACC,
      month: MONTH,
      plan,
      fingerprint: fingerprintPlanInput(ACC, MONTH, plan),
      expectedUpdatedAt: UPDATED.toISOString(),
      nowIso: "2026-08-01T10:00:00Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("hard_blocked");
      expect(r.hardBlockers?.length).toBeGreaterThan(0);
    }
  });

  it("tx içinde updatedAt değişirse (yarış) stale — uygulanmaz", async () => {
    configureExistingPlan({ slots: [] });
    // Pre-tx eşleşir; tx içi fresh farklı updatedAt döner → stale.
    txMock.reelPlan.findUnique.mockResolvedValue({
      id: "plan-1",
      updatedAt: new Date("2099-01-01"),
      status: "draft",
    });
    const r = await applyPlan({
      accountId: ACC,
      month: MONTH,
      plan: SIMPLE_PLAN,
      fingerprint: fp(),
      expectedUpdatedAt: UPDATED.toISOString(),
      nowIso: "2026-08-01T10:00:00Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("stale");
  });
});

describe("transitionPlanStatus — lifecycle", () => {
  it("draft→active uyarı varsa ack ister", async () => {
    configureExistingPlan({ status: "draft", notesJson: JSON.stringify(["Mix sapması"]) });
    const r = await transitionPlanStatus({
      accountId: ACC,
      month: MONTH,
      target: "active",
      expectedUpdatedAt: UPDATED.toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ack_required");
  });

  it("draft→active ack ile geçer", async () => {
    configureExistingPlan({ status: "draft", notesJson: JSON.stringify(["Mix sapması"]) });
    txMock.reelPlan.update.mockResolvedValue({ status: "active", updatedAt: new Date("2026-08-01T10:00:00Z") });
    const r = await transitionPlanStatus({
      accountId: ACC,
      month: MONTH,
      target: "active",
      expectedUpdatedAt: UPDATED.toISOString(),
      acknowledgeWarnings: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("active");
  });

  it("aynı duruma geçiş invalid", async () => {
    configureExistingPlan({ status: "draft" });
    const r = await transitionPlanStatus({
      accountId: ACC,
      month: MONTH,
      target: "draft",
      expectedUpdatedAt: UPDATED.toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_transition");
  });

  it("active→archived (uyarısız) geçer", async () => {
    configureExistingPlan({ status: "active", notesJson: "[]" });
    txMock.reelPlan.update.mockResolvedValue({ status: "archived", updatedAt: new Date("2026-08-01T10:00:00Z") });
    const r = await transitionPlanStatus({
      accountId: ACC,
      month: MONTH,
      target: "archived",
      expectedUpdatedAt: UPDATED.toISOString(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("archived");
  });

  it("plan yoksa not_found", async () => {
    mockPlanFind.mockResolvedValue(null as never);
    const r = await transitionPlanStatus({
      accountId: ACC,
      month: MONTH,
      target: "active",
      expectedUpdatedAt: UPDATED.toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_found");
  });
});

describe("resolveSeriesForPlan — DB truth", () => {
  it("bilinmeyen/inaktif seri invalid döner", async () => {
    vi.mocked(prisma.seriesProfile.findMany).mockResolvedValue([] as never);
    const r = await resolveSeriesForPlan(ACC, PILLARS, [{ seriesKey: "yok", pillar: "a", episodesPerMonth: 2 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid[0]).toContain("aktif seri yok");
  });

  it("yanlış format (thread) reddedilir", async () => {
    vi.mocked(prisma.seriesProfile.findMany).mockResolvedValue([
      { seriesKey: "s1", name: "Seri", format: "thread", pastTopicsJson: "[]", bannedRepetitionJson: "[]" },
    ] as never);
    const r = await resolveSeriesForPlan(ACC, PILLARS, [{ seriesKey: "s1", pillar: "a", episodesPerMonth: 2 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid[0]).toContain("format");
  });

  it("geçerli seri DB adını + past/banned döndürür (client override değil)", async () => {
    vi.mocked(prisma.seriesProfile.findMany).mockResolvedValue([
      {
        seriesKey: "s1",
        name: "Gerçek Seri Adı",
        format: "carousel",
        pastTopicsJson: JSON.stringify(["eski konu"]),
        bannedRepetitionJson: JSON.stringify(["yasak"]),
      },
    ] as never);
    const r = await resolveSeriesForPlan(ACC, PILLARS, [{ seriesKey: "s1", pillar: "a", episodesPerMonth: 2 }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.series[0].displayName).toBe("Gerçek Seri Adı");
      expect(r.pastTopics).toEqual(["eski konu"]);
      expect(r.bannedRepetition).toEqual(["yasak"]);
    }
  });
});

describe("computePlanPreview — sıfır write", () => {
  it("preview DB'ye yazmaz (create/update çağrısı yok)", async () => {
    configureExistingPlan({ slots: [slotRow({ id: "m1", dayOfMonth: 20 })] });
    const preview = await computePlanPreview({ accountId: ACC, month: MONTH, plan: SIMPLE_PLAN });
    expect(preview.slotsAdded.map((s) => s.dayOfMonth)).toEqual([3]);
    expect(preview.slotsSkipped.map((s) => s.slotId)).toEqual(["m1"]);
    expect(preview.expectedUpdatedAt).toBe(UPDATED.toISOString());
    expect(txMock.reelPlanSlot.createMany).not.toHaveBeenCalled();
    expect(txMock.reelPlan.update).not.toHaveBeenCalled();
  });
});
