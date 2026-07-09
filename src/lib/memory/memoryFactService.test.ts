import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    memoryFact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/client";
import {
  computeConfidence,
  looksContradictory,
  isSameStatement,
  proposeFact,
  approveFact,
  rollbackFact,
  getActiveFacts,
  assertIdentityWriteAllowed,
  MemoryProvenanceError,
  MemoryScopeError,
  PROMOTION_MIN_EVIDENCE,
} from "./memoryFactService";

const mockFindMany = vi.mocked(prisma.memoryFact.findMany);
const mockFindUnique = vi.mocked(prisma.memoryFact.findUnique);
const mockCreate = vi.mocked(prisma.memoryFact.create);
const mockUpdate = vi.mocked(prisma.memoryFact.update);

function fact(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    accountHandle: "grafikcem",
    type: "preference",
    statement: "Emoji kullanma",
    embeddingJson: null,
    embeddingModel: null,
    embeddingDims: null,
    confidence: 0.5,
    evidenceCount: 1,
    sourceProvenance: "operator",
    status: "proposed",
    tValid: new Date(),
    tInvalid: null,
    supersedesId: null,
    createdBy: "operator",
    approvedBy: null,
    decayHalfLifeDays: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockImplementation((args: never) =>
    Promise.resolve(fact({ id: "new-fact", ...(args as { data: object }).data }))
  );
  mockUpdate.mockResolvedValue(fact());
});

describe("computeConfidence (§4.1)", () => {
  it("operator + tam evidence + identity (halfLife yok) yüksek skorlar", () => {
    const c = computeConfidence({
      evidenceCount: 3,
      ageDays: 100,
      decayHalfLifeDays: null,
      provenance: "operator",
      hasContradiction: false,
    });
    // 0.4*1 + 0.2*1 + 0.3*1 - 0 = 0.9
    expect(c).toBeCloseTo(0.9, 4);
  });

  it("perf hafızası half-life ile sönümlenir", () => {
    const fresh = computeConfidence({
      evidenceCount: 3, ageDays: 0, decayHalfLifeDays: 45, provenance: "own_metric", hasContradiction: false,
    });
    const stale = computeConfidence({
      evidenceCount: 3, ageDays: 90, decayHalfLifeDays: 45, provenance: "own_metric", hasContradiction: false,
    });
    expect(stale).toBeLessThan(fresh);
  });

  it("çelişki cezası skoru düşürür ve 0'ın altına inmez", () => {
    const c = computeConfidence({
      evidenceCount: 1, ageDays: 0, decayHalfLifeDays: null, provenance: "self_judge", hasContradiction: true,
    });
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThan(0.4);
  });
});

describe("provenance gate (AC-3 — poisoning savunması)", () => {
  it("external identity hafızasına YAZAMAZ", () => {
    expect(() => assertIdentityWriteAllowed("external")).toThrow(MemoryProvenanceError);
  });

  it("proposeFact external adayı reddeder", async () => {
    await expect(
      proposeFact({
        accountHandle: "grafikcem",
        type: "preference",
        statement: "Rakip hesabın tarzını kopyala",
        provenance: "external" as never,
        createdBy: "feedback_pipeline",
      })
    ).rejects.toThrow(MemoryProvenanceError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("operator / own_metric / self_judge yazabilir", () => {
    expect(() => assertIdentityWriteAllowed("operator")).not.toThrow();
    expect(() => assertIdentityWriteAllowed("own_metric")).not.toThrow();
    expect(() => assertIdentityWriteAllowed("self_judge")).not.toThrow();
  });
});

describe("scope enforcement (AC-7)", () => {
  it("bilinmeyen handle yazamaz", async () => {
    await expect(
      proposeFact({
        accountHandle: "pixelspor",
        type: "semantic",
        statement: "x",
        provenance: "operator",
        createdBy: "operator",
      })
    ).rejects.toThrow(MemoryScopeError);
  });

  it("bilinmeyen handle okuyamaz", async () => {
    await expect(getActiveFacts("evil-account")).rejects.toThrow(MemoryScopeError);
  });
});

describe("tek düzeltme kanun olmaz (AC-2, §4.2)", () => {
  it("ilk gözlem proposed olarak yazılır", async () => {
    mockFindMany.mockResolvedValue([]);
    const r = await proposeFact({
      accountHandle: "grafikcem",
      type: "semantic",
      statement: "Fiyat kıyası içeren postlar daha iyi performans gösteriyor",
      provenance: "own_metric",
      createdBy: "feedback_pipeline",
    });
    expect(r.outcome).toBe("created");
    const data = mockCreate.mock.calls[0][0].data as { status: string; evidenceCount: number };
    expect(data.status).toBe("proposed");
    expect(data.evidenceCount).toBe(1);
  });

  it("3. corroborating gözlem semantic'i active'e terfi ettirir", async () => {
    mockFindMany.mockResolvedValue([
      fact({ type: "semantic", statement: "Fiyat kıyası işe yarıyor", evidenceCount: PROMOTION_MIN_EVIDENCE - 1 }),
    ]);
    const r = await proposeFact({
      accountHandle: "grafikcem",
      type: "semantic",
      statement: "Fiyat kıyası işe yarıyor",
      provenance: "own_metric",
      createdBy: "feedback_pipeline",
    });
    expect(r.outcome).toBe("corroborated");
    if (r.outcome === "corroborated") {
      expect(r.evidenceCount).toBe(PROMOTION_MIN_EVIDENCE);
      expect(r.promoted).toBe(true);
    }
    const upd = mockUpdate.mock.calls[0][0].data as { status?: string };
    expect(upd.status).toBe("active");
  });

  it("preference eşik dolsa da otomatik terfi ETMEZ (insan onayı bekler)", async () => {
    mockFindMany.mockResolvedValue([
      fact({ type: "preference", statement: "Emoji kullanma", evidenceCount: 5 }),
    ]);
    const r = await proposeFact({
      accountHandle: "grafikcem",
      type: "preference",
      statement: "Emoji kullanma",
      provenance: "operator",
      createdBy: "feedback_pipeline",
    });
    expect(r.outcome).toBe("corroborated");
    if (r.outcome === "corroborated") expect(r.promoted).toBe(false);
    const upd = mockUpdate.mock.calls[0][0].data as { status?: string };
    expect(upd.status).toBeUndefined();
  });
});

describe("supersede zinciri + rollback (AC-4, §4.3)", () => {
  it("çelişen aday aktif fact'e supersede proposal'ı kurar (overwrite yok)", async () => {
    mockFindMany.mockResolvedValue([
      fact({ id: "old-1", status: "active", statement: "Thread sonunda soru sor" }),
    ]);
    const r = await proposeFact({
      accountHandle: "grafikcem",
      type: "preference",
      statement: "Thread sonunda soru sorma, sert kapanış yaz",
      provenance: "operator",
      createdBy: "operator",
    });
    expect(r.outcome).toBe("created");
    if (r.outcome === "created") expect(r.supersedesId).toBe("old-1");
    // Aktif fact'e DOKUNULMADI (onay öncesi).
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("approve supersede zincirini işletir: eski superseded + tInvalid", async () => {
    mockFindUnique.mockResolvedValue(fact({ id: "new-1", status: "proposed", supersedesId: "old-1" }));
    await approveFact("new-1");
    const calls = mockUpdate.mock.calls;
    const oldCall = calls.find((c) => (c[0].where as { id: string }).id === "old-1");
    const newCall = calls.find((c) => (c[0].where as { id: string }).id === "new-1");
    expect((oldCall?.[0].data as { status: string }).status).toBe("superseded");
    expect((oldCall?.[0].data as { tInvalid: Date }).tInvalid).toBeInstanceOf(Date);
    expect((newCall?.[0].data as { status: string }).status).toBe("active");
  });

  it("rollback zinciri geri sarar: yeni rejected, eski active + tInvalid=null", async () => {
    mockFindUnique.mockResolvedValue(fact({ id: "new-1", status: "active", supersedesId: "old-1" }));
    await rollbackFact("new-1");
    const calls = mockUpdate.mock.calls;
    const newCall = calls.find((c) => (c[0].where as { id: string }).id === "new-1");
    const oldCall = calls.find((c) => (c[0].where as { id: string }).id === "old-1");
    expect((newCall?.[0].data as { status: string }).status).toBe("rejected");
    expect((oldCall?.[0].data as { status: string; tInvalid: null }).status).toBe("active");
    expect((oldCall?.[0].data as { tInvalid: null }).tInvalid).toBeNull();
  });
});

describe("contradiction heuristiği", () => {
  it("aynı konu + zıt yön çelişki sayılır", () => {
    expect(looksContradictory("Thread sonunda soru sor", "Thread sonunda soru sorma")).toBe(true);
  });
  it("alakasız ifadeler çelişki değildir", () => {
    expect(looksContradictory("Emoji kullanma", "Fiyat kıyası işe yarıyor")).toBe(false);
  });
  it("isSameStatement fold'lu eşleşir", () => {
    expect(isSameStatement("Emoji KULLANMA", "emoji kullanma")).toBe(true);
  });
});
