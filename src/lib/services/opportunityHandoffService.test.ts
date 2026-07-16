import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateHandoffSchema,
  HANDOFF_SCHEMA_VERSION,
  HandoffFlowError,
  handoffErrorResponse,
  handoffFingerprint,
  opportunityHandoffService,
} from "./opportunityHandoffService";
import { prisma } from "@/lib/db/client";

/**
 * ADR-028 — OpportunityHandoff state machine testleri (DB mock; ağ/ücret yok).
 */

vi.mock("@/lib/db/client", () => ({
  prisma: {
    opportunityHandoff: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

const db = prisma as unknown as {
  opportunityHandoff: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

const VALID_INPUT = {
  accountId: "acc-1",
  action: "generate" as const,
  sourceKind: "news" as const,
  sourceId: "news-1",
  title: "AI görsel tespiti",
  topicSeed: "AI görsel tespiti",
  whyNow: "teyitli + taze",
  suggestedPlatform: "X" as const,
  score: 82,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "h-1",
    accountId: "acc-1",
    action: "generate",
    status: "pending",
    sourceKind: "news",
    sourceId: "news-1",
    sourcePlatform: "",
    title: "AI görsel tespiti",
    topicSeed: "AI görsel tespiti",
    whyNow: "teyitli + taze",
    whyNowDetail: "",
    rawTab: "news-pool",
    suggestedPlatform: "X",
    score: 82,
    curationMethod: "deterministic",
    payloadJson: JSON.stringify({ schemaVersion: HANDOFF_SCHEMA_VERSION }),
    fingerprint: "fp",
    resultQueueItemId: null,
    resultRef: null,
    blockedReason: null,
    consumedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createHandoff (idempotent)", () => {
  it("yeni fırsat satır yaratır (fingerprint deterministik)", async () => {
    db.opportunityHandoff.findUnique.mockResolvedValue(null);
    db.opportunityHandoff.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      row(data)
    );
    const r = await opportunityHandoffService.createHandoff(VALID_INPUT);
    expect(r.reused).toBe(false);
    expect(db.opportunityHandoff.create).toHaveBeenCalledTimes(1);
    const created = db.opportunityHandoff.create.mock.calls[0][0].data;
    expect(created.fingerprint).toBe(handoffFingerprint(VALID_INPUT));
    expect(JSON.parse(created.payloadJson).schemaVersion).toBe(HANDOFF_SCHEMA_VERSION);
  });

  it("duplicate click yeni satır ÜRETMEZ — mevcut pending döner", async () => {
    db.opportunityHandoff.findUnique.mockResolvedValue(row());
    const r = await opportunityHandoffService.createHandoff(VALID_INPUT);
    expect(r.reused).toBe(true);
    expect(db.opportunityHandoff.create).not.toHaveBeenCalled();
  });

  it("cancelled kayıt yeniden pending'e döner (kullanıcı yeniden istedi)", async () => {
    db.opportunityHandoff.findUnique.mockResolvedValue(row({ status: "cancelled" }));
    db.opportunityHandoff.update.mockResolvedValue(row({ status: "pending" }));
    const r = await opportunityHandoffService.createHandoff(VALID_INPUT);
    expect(r.reused).toBe(true);
    expect(db.opportunityHandoff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "pending", blockedReason: null } })
    );
  });

  it("eşzamanlı yarış (P2002) kazanan satırı döner", async () => {
    db.opportunityHandoff.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row());
    db.opportunityHandoff.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const r = await opportunityHandoffService.createHandoff(VALID_INPUT);
    expect(r.reused).toBe(true);
  });

  it("geçersiz girdi Zod'da düşer", async () => {
    await expect(opportunityHandoffService.createHandoff({ ...VALID_INPUT, action: "yok" })).rejects.toThrow();
    expect(CreateHandoffSchema.safeParse({ ...VALID_INPUT, score: 999 }).success).toBe(false);
  });
});

describe("consume (idempotent claim)", () => {
  it("pending → consumed + sonuç referansı", async () => {
    db.opportunityHandoff.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ status: "consumed", resultRef: "slot-1" }));
    db.opportunityHandoff.updateMany.mockResolvedValue({ count: 1 });
    const r = await opportunityHandoffService.consume("h-1", { resultRef: "slot-1" });
    expect(r.alreadyConsumed).toBe(false);
    expect(db.opportunityHandoff.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "h-1", status: "pending" } })
    );
  });

  it("tekrar consume idempotent — mevcut sonucu döner, ikinci yazım yok", async () => {
    db.opportunityHandoff.findUnique
      .mockResolvedValueOnce(row({ status: "consumed", resultRef: "slot-1" }))
      .mockResolvedValueOnce(row({ status: "consumed", resultRef: "slot-1" }));
    db.opportunityHandoff.updateMany.mockResolvedValue({ count: 0 });
    const r = await opportunityHandoffService.consume("h-1", { resultRef: "slot-99" });
    expect(r.alreadyConsumed).toBe(true);
    expect(r.handoff.resultRef).toBe("slot-1"); // İLK sonuç korunur
  });

  it("cancelled tüketilemez", async () => {
    db.opportunityHandoff.findUnique.mockResolvedValue(row({ status: "cancelled" }));
    await expect(opportunityHandoffService.consume("h-1", {})).rejects.toMatchObject({ code: "cancelled" });
  });

  it("bozuk/yabancı payload sürümü fail-closed", async () => {
    db.opportunityHandoff.findUnique.mockResolvedValue(row({ payloadJson: JSON.stringify({ schemaVersion: "99" }) }));
    await expect(opportunityHandoffService.consume("h-1", {})).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("bulunamayan handoff not_found", async () => {
    db.opportunityHandoff.findUnique.mockResolvedValue(null);
    await expect(opportunityHandoffService.consume("yok", {})).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("cancel / markBlocked", () => {
  it("cancel idempotent; consumed iptal edilemez", async () => {
    db.opportunityHandoff.findUnique.mockResolvedValue(row({ status: "cancelled" }));
    const r = await opportunityHandoffService.cancel("h-1");
    expect(r.status).toBe("cancelled");
    expect(db.opportunityHandoff.update).not.toHaveBeenCalled();

    db.opportunityHandoff.findUnique.mockResolvedValue(row({ status: "consumed" }));
    await expect(opportunityHandoffService.cancel("h-1")).rejects.toMatchObject({ code: "already_consumed" });
  });

  it("markBlocked fırsatı KAYBETMEZ — pending kalır, neden yazılır", async () => {
    db.opportunityHandoff.findUnique.mockResolvedValue(row());
    db.opportunityHandoff.update.mockResolvedValue(row({ blockedReason: "budget:monthly_limit" }));
    const r = await opportunityHandoffService.markBlocked("h-1", "budget:monthly_limit");
    expect(r.status).toBe("pending");
    expect(r.blockedReason).toBe("budget:monthly_limit");
  });
});

describe("hata eşlemesi", () => {
  it("HandoffFlowError → doğru HTTP status", () => {
    expect(handoffErrorResponse(new HandoffFlowError("not_found", "x")).status).toBe(404);
    expect(handoffErrorResponse(new HandoffFlowError("plan_not_found", "x")).status).toBe(422);
    expect(handoffErrorResponse(new HandoffFlowError("already_consumed", "x")).status).toBe(409);
  });

  it("hesap izolasyonu: fingerprint hesapla birleşik unique'tir (aynı fırsat farklı hesapta ayrı satır)", () => {
    // Unique anahtar (accountId, action, fingerprint) — fingerprint hesaptan
    // bağımsızdır ama satır hesaba bağlıdır; list() accountId filtresi zorlar.
    const fp1 = handoffFingerprint(VALID_INPUT);
    const fp2 = handoffFingerprint({ ...VALID_INPUT, sourceId: "news-2" });
    expect(fp1).not.toBe(fp2);
    expect(fp1).toHaveLength(32);
  });
});
