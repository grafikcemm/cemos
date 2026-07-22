import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * planHealthService (ADR-039 §9) — mocked prisma + Phase 3D getDossierProductionState:
 *  - plan yok → not_configured
 *  - aktif plan + bağlı dossier → production durumu 3D'den TÜRETİLİR
 *  - fail-soft → unknown (healthy uydurmaz)
 */

vi.mock("@/lib/db/client", () => ({
  prisma: {
    reelPlan: { findFirst: vi.fn() },
    reelPlanSlot: { findMany: vi.fn(() => Promise.resolve([])) },
    reelDossier: { findMany: vi.fn(() => Promise.resolve([])) },
  },
}));
vi.mock("@/lib/reels/dossierProductionService", () => ({
  getDossierProductionState: vi.fn(),
}));

import { prisma } from "@/lib/db/client";
import { getDossierProductionState } from "@/lib/reels/dossierProductionService";
import { getInstagramPlanHealth } from "./planHealthService";

const mockPlanFind = vi.mocked(prisma.reelPlan.findFirst);
const mockSlotFind = vi.mocked(prisma.reelPlanSlot.findMany);
const mockDossierFind = vi.mocked(prisma.reelDossier.findMany);
const mockProdState = vi.mocked(getDossierProductionState);

const NOW = Date.parse("2026-08-10T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockSlotFind.mockResolvedValue([] as never);
  mockDossierFind.mockResolvedValue([] as never);
});

describe("getInstagramPlanHealth", () => {
  it("plan yoksa not_configured", async () => {
    mockPlanFind.mockResolvedValue(null as never);
    const r = await getInstagramPlanHealth(NOW);
    expect(r.configured).toBe(false);
    expect(r.status).toBe("ok");
  });

  it("aktif plan + bağlı hazır dossier → production durumu 3D'den türetilir", async () => {
    mockPlanFind.mockResolvedValue({
      id: "plan-1",
      accountId: "acc-1",
      month: "2026-08",
      status: "active",
      notesJson: "[]",
    } as never);
    mockSlotFind.mockResolvedValue([
      { id: "s1", dayOfMonth: 12, status: "drafted", dossierId: "d1" },
    ] as never);
    mockDossierFind.mockResolvedValue([{ id: "d1" }] as never);
    mockProdState.mockResolvedValue({
      productionReady: true,
      overall: "production_ready",
      layers: { evidence: { state: "ready" } },
    } as never);

    const r = await getInstagramPlanHealth(NOW);
    expect(r.configured).toBe(true);
    expect(r.planStatus).toBe("active");
    expect(r.counts.productionReady).toBe(1);
    expect(mockProdState).toHaveBeenCalledTimes(1);
    // Bugün (12), slot günü 12, production_ready → todayUnready 0.
    expect(r.todayUnready).toBe(0);
  });

  it("aktif plan + bağlı OLMAYAN slot bugün → warn (dossier bekliyor)", async () => {
    mockPlanFind.mockResolvedValue({
      id: "plan-1",
      accountId: "acc-1",
      month: "2026-08",
      status: "active",
      notesJson: "[]",
    } as never);
    mockSlotFind.mockResolvedValue([{ id: "s1", dayOfMonth: 10, status: "planned", dossierId: null }] as never);
    const r = await getInstagramPlanHealth(NOW);
    expect(r.status).toBe("warn");
    expect(r.counts.withoutDossier).toBe(1);
    expect(mockProdState).not.toHaveBeenCalled();
  });

  it("prisma hata verirse unknown (fail-soft)", async () => {
    mockPlanFind.mockRejectedValue(new Error("db down"));
    const r = await getInstagramPlanHealth(NOW);
    expect(r.status).toBe("unknown");
    expect(r.configured).toBe(false);
  });
});
