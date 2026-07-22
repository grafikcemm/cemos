import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Attach/detach sözleşmesi (ADR-038 §F) — route seviyesinde hermetic:
 * cross-account reddi, seri provenance eşleşmesi, aynı dossier'in ikinci
 * aktif slota bağlanamaması, idempotent attach, yarış 409, detach'in dossier
 * SİLMEMESİ ve `drafted` ≠ production-ready dürüstlüğü.
 */

const txMock = {
  $queryRaw: vi.fn(() => Promise.resolve([])),
  reelPlanSlot: {
    findUnique: vi.fn(),
    findFirst: vi.fn(() => Promise.resolve(null)),
    updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
  },
  reelDossier: { findUnique: vi.fn() },
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    reelPlanSlot: {
      findUnique: vi.fn(),
      findMany: vi.fn(() => Promise.resolve([])),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    reelDossier: { findUnique: vi.fn(() => Promise.resolve(null)) },
    websiteVerification: { findUnique: vi.fn(() => Promise.resolve(null)) },
    seriesProfile: { findFirst: vi.fn(() => Promise.resolve(null)) },
    trainingExample: { findFirst: vi.fn(() => Promise.resolve(null)) },
  },
}));
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: {
    create: vi.fn(() => Promise.resolve({ id: "pt" })),
    listBySubject: vi.fn(() => Promise.resolve([])),
  },
}));

import { prisma } from "@/lib/db/client";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { POST as attachPOST } from "./route";
import { POST as detachPOST } from "../detach/route";

function req(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "slot-1" }) };

function slot(overrides: Record<string, unknown> = {}) {
  return {
    id: "slot-1",
    planId: "plan-1",
    dayOfMonth: 20,
    pillar: "arac_demo",
    mixBucket: "evergreen",
    seriesKey: null,
    dossierId: null,
    topicHint: "",
    status: "planned",
    plan: { accountId: "acc-1" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  txMock.$queryRaw.mockResolvedValue([]);
  txMock.reelPlanSlot.findFirst.mockResolvedValue(null as never);
  txMock.reelPlanSlot.updateMany.mockResolvedValue({ count: 1 } as never);
  txMock.reelDossier.findUnique.mockResolvedValue({ accountId: "acc-1" } as never);
  vi.mocked(pipelineTraceRepo.listBySubject).mockResolvedValue([] as never);
  // Attach sonrası production özeti için root dossier yüklemesi.
  vi.mocked(prisma.reelDossier.findUnique).mockResolvedValue({
    id: "rd-1",
    accountId: "acc-1",
    title: "t",
    format: "reel",
    primaryToolJson: "{}",
    verificationId: null,
    verificationEvidenceJson: "{}",
    alternativesJson: "[]",
    hook: "h",
    script: "s",
    timelineJson: "[]",
    scenePlanJson: "[]",
    screenRecordingPlanJson: "[]",
    voiceover: "v",
    onScreenCopyJson: "[]",
    cover: "c",
    cta: "cta",
    caption: "cap",
    hashtagGroupJson: "[]",
    slidesJson: "[]",
    expiry: null,
    finalReadiness: "ready",
    updatedAt: new Date(),
    createdAt: new Date(),
  } as never);
});

describe("attach — sözleşme", () => {
  it("cross-account dossier reddedilir (422)", async () => {
    txMock.reelPlanSlot.findUnique.mockResolvedValue(slot() as never);
    txMock.reelDossier.findUnique.mockResolvedValue({ accountId: "OTHER" } as never);
    const res = await attachPOST(req("/api/reels/plan/slot/slot-1/attach", { accountId: "acc-1", dossierId: "rd-1" }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("dossier_account_mismatch");
  });

  it("seri slotu: provenance seriesKey eşleşmezse 422 series_mismatch", async () => {
    txMock.reelPlanSlot.findUnique.mockResolvedValue(slot({ seriesKey: "best_ai_tools" }) as never);
    vi.mocked(pipelineTraceRepo.listBySubject).mockResolvedValue([
      { stages: [{ stage: "provenance", seriesKey: "baska_seri" }] },
    ] as never);
    const res = await attachPOST(req("/api/reels/plan/slot/slot-1/attach", { accountId: "acc-1", dossierId: "rd-1" }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("series_mismatch");
  });

  it("seri slotu: provenance'sız dossier de reddedilir (string tahmini yok)", async () => {
    txMock.reelPlanSlot.findUnique.mockResolvedValue(slot({ seriesKey: "best_ai_tools" }) as never);
    const res = await attachPOST(req("/api/reels/plan/slot/slot-1/attach", { accountId: "acc-1", dossierId: "rd-1" }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("series_mismatch");
  });

  it("aynı dossier başka aktif slota bağlıysa 409 dossier_already_attached", async () => {
    txMock.reelPlanSlot.findUnique.mockResolvedValue(slot() as never);
    txMock.reelPlanSlot.findFirst.mockResolvedValue({ id: "slot-2" } as never);
    const res = await attachPOST(req("/api/reels/plan/slot/slot-1/attach", { accountId: "acc-1", dossierId: "rd-1" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("dossier_already_attached");
  });

  it("idempotent: aynı dossier aynı slota tekrar → alreadyAttached, update yok", async () => {
    txMock.reelPlanSlot.findUnique.mockResolvedValue(slot({ dossierId: "rd-1" }) as never);
    const res = await attachPOST(req("/api/reels/plan/slot/slot-1/attach", { accountId: "acc-1", dossierId: "rd-1" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadyAttached).toBe(true);
    expect(txMock.reelPlanSlot.updateMany).not.toHaveBeenCalled();
  });

  it("yarış: atomic claim 0 satır → 409 slot_race", async () => {
    txMock.reelPlanSlot.findUnique.mockResolvedValue(slot() as never);
    txMock.reelPlanSlot.updateMany.mockResolvedValue({ count: 0 } as never);
    const res = await attachPOST(req("/api/reels/plan/slot/slot-1/attach", { accountId: "acc-1", dossierId: "rd-1" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("slot_race");
  });

  it("başarılı bağlama DÜRÜST: productionReady:false + blockers döner (drafted ≠ hazır)", async () => {
    txMock.reelPlanSlot.findUnique.mockResolvedValue(slot() as never);
    const res = await attachPOST(req("/api/reels/plan/slot/slot-1/attach", { accountId: "acc-1", dossierId: "rd-1" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadyAttached).toBe(false);
    // Onay yok → bağlansa bile yayına hazır değil.
    expect(json.productionReady).toBe(false);
    expect(json.blockers).toContain("awaiting_human_approval");
  });
});

describe("detach — sözleşme", () => {
  const rootSlot = vi.mocked(prisma.reelPlanSlot.findUnique);
  const rootUpdateMany = vi.mocked(prisma.reelPlanSlot.updateMany);
  const dctx = { params: Promise.resolve({ id: "slot-1" }) };

  it("dossier silinmez — yalnız slot ilişkisi çözülür, slot planned'e döner", async () => {
    rootSlot.mockResolvedValue(slot({ dossierId: "rd-1", status: "drafted" }) as never);
    const res = await detachPOST(req("/api/reels/plan/slot/slot-1/detach", { accountId: "acc-1", expectedDossierId: "rd-1" }), dctx);
    expect(res.status).toBe(200);
    const where = rootUpdateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(where.data).toEqual({ dossierId: null, status: "planned" });
  });

  it("beklenen dossier değişmişse 409 (yanlış bağlantı çözülemez)", async () => {
    rootSlot.mockResolvedValue(slot({ dossierId: "rd-OTHER", status: "drafted" }) as never);
    const res = await detachPOST(req("/api/reels/plan/slot/slot-1/detach", { accountId: "acc-1", expectedDossierId: "rd-1" }), dctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("dossier_mismatch");
  });

  it("done slot çözülemez (işlenmiş geçmiş korunur)", async () => {
    rootSlot.mockResolvedValue(slot({ dossierId: "rd-1", status: "done" }) as never);
    const res = await detachPOST(req("/api/reels/plan/slot/slot-1/detach", { accountId: "acc-1", expectedDossierId: "rd-1" }), dctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("slot_done");
  });

  it("idempotent: zaten boş slot → alreadyDetached", async () => {
    rootSlot.mockResolvedValue(slot() as never);
    const res = await detachPOST(req("/api/reels/plan/slot/slot-1/detach", { accountId: "acc-1", expectedDossierId: "rd-1" }), dctx);
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyDetached).toBe(true);
  });

  it("cross-account slot reddedilir", async () => {
    rootSlot.mockResolvedValue(slot({ plan: { accountId: "OTHER" } }) as never);
    const res = await detachPOST(req("/api/reels/plan/slot/slot-1/detach", { accountId: "acc-1", expectedDossierId: "rd-1" }), dctx);
    expect(res.status).toBe(422);
  });
});
