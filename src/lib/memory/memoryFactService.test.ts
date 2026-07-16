import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/accounts/profileRepository", () =>
  import("@/lib/accounts/profileRepository.testDouble").then((m) =>
    m.createProfileRepositoryTestDouble()
  )
);

vi.mock("@/lib/db/client", () => {
  const memoryFact = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const memoryEvidence = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  };
  const prisma = {
    memoryFact,
    memoryEvidence,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return { prisma };
});

import { prisma } from "@/lib/db/client";
import {
  computeConfidence,
  looksContradictory,
  isSameStatement,
  canonicalStatementKey,
  proposeFact,
  approveFact,
  rejectFact,
  rollbackFact,
  reviseFact,
  getActiveFacts,
  assertIdentityWriteAllowed,
  MemoryProvenanceError,
  MemoryScopeError,
  MemoryGovernanceError,
  PROMOTION_MIN_EVIDENCE,
} from "./memoryFactService";

const mockFindMany = vi.mocked(prisma.memoryFact.findMany);
const mockFindUnique = vi.mocked(prisma.memoryFact.findUnique);
const mockCreate = vi.mocked(prisma.memoryFact.create);
const mockUpdate = vi.mocked(prisma.memoryFact.update);
const mockEvFindUnique = vi.mocked(prisma.memoryEvidence.findUnique);
const mockEvCreate = vi.mocked(prisma.memoryEvidence.create);
const mockEvCount = vi.mocked(prisma.memoryEvidence.count);

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
    canonicalKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never;
}

const EV = {
  sourceType: "feedback_event" as const,
  sourceId: "fe-1",
  signalType: "not_my_tone",
  direction: "negative" as const,
  excerpt: "ton dışı",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockImplementation(((args: { data: object }) =>
    Promise.resolve(fact({ id: "new-fact", ...args.data }))) as never);
  mockUpdate.mockResolvedValue(fact());
  mockEvFindUnique.mockResolvedValue(null);
  mockEvCreate.mockResolvedValue({ id: "ev-1" } as never);
  mockEvCount.mockResolvedValue(0);
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
    expect(c).toBeCloseTo(0.9, 4);
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
});

describe("scope enforcement (AC-7)", () => {
  it("bilinmeyen handle yazamaz / okuyamaz", async () => {
    await expect(
      proposeFact({ accountHandle: "pixelspor", type: "semantic", statement: "x", provenance: "operator", createdBy: "operator" })
    ).rejects.toThrow(MemoryScopeError);
    await expect(getActiveFacts("evil-account")).rejects.toThrow(MemoryScopeError);
  });

  it("cross-account mutasyon reddedilir (expectedAccountHandle)", async () => {
    mockFindUnique.mockResolvedValue(fact({ accountHandle: "grafikcem", status: "proposed" }));
    await expect(rejectFact("f1", { expectedAccountHandle: "maskulenkod" })).rejects.toMatchObject({
      code: "account_mismatch",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("ADR-029: otomatik aktifleşme YOK — insan-onaylı promotion", () => {
  it("ilk gözlem proposed + kanıt satırıyla yazılır", async () => {
    mockFindMany.mockResolvedValue([]);
    const r = await proposeFact({
      accountHandle: "grafikcem",
      type: "semantic",
      statement: "Fiyat kıyası içeren postlar daha iyi performans gösteriyor",
      provenance: "own_metric",
      createdBy: "feedback_pipeline",
      evidence: EV,
    });
    expect(r.outcome).toBe("created");
    if (r.outcome === "created") expect(r.reviewReady).toBe(false);
    const data = mockCreate.mock.calls[0][0].data as { status: string; canonicalKey: string };
    expect(data.status).toBe("proposed");
    expect(data.canonicalKey).toBe(canonicalStatementKey("grafikcem", "semantic", "Fiyat kıyası içeren postlar daha iyi performans gösteriyor"));
    expect(mockEvCreate).toHaveBeenCalledTimes(1);
  });

  it("3. distinct kanıt SEMANTİK'i bile aktifleştirMEZ — yalnız reviewReady yapar", async () => {
    const row = fact({ type: "semantic", statement: "Fiyat kıyası işe yarıyor", evidenceCount: 2, createdBy: "feedback_pipeline" });
    mockFindMany.mockResolvedValue([row]);
    mockFindUnique.mockResolvedValue(row); // corroborate txn içi yeniden-okuma
    mockEvCount.mockResolvedValue(PROMOTION_MIN_EVIDENCE); // defterde 3 distinct
    const r = await proposeFact({
      accountHandle: "grafikcem",
      type: "semantic",
      statement: "Fiyat kıyası işe yarıyor",
      provenance: "own_metric",
      createdBy: "feedback_pipeline",
      evidence: { ...EV, sourceId: "fe-3" },
    });
    expect(r.outcome).toBe("corroborated");
    if (r.outcome === "corroborated") {
      expect(r.evidenceCount).toBe(3);
      expect(r.reviewReady).toBe(true);
    }
    // Status YAZILMADI — proposed kalır (otomatik aktifleşme kaldırıldı).
    const upd = mockUpdate.mock.calls[0][0].data as { status?: string };
    expect(upd.status).toBeUndefined();
  });

  it("aynı FeedbackEvent retry'ı kanıt sayısını ARTIRAMAZ (idempotent)", async () => {
    const row = fact({ statement: "Emoji kullanma", evidenceCount: 2, createdBy: "feedback_pipeline" });
    mockFindMany.mockResolvedValue([row]);
    mockFindUnique.mockResolvedValue(row);
    mockEvFindUnique.mockResolvedValue({ id: "ev-existing" } as never); // aynı olay zaten defterde
    mockEvCount.mockResolvedValue(2);
    const r = await proposeFact({
      accountHandle: "grafikcem",
      type: "preference",
      statement: "Emoji kullanma",
      provenance: "operator",
      createdBy: "feedback_pipeline",
      evidence: EV,
    });
    expect(mockEvCreate).not.toHaveBeenCalled();
    if (r.outcome === "corroborated") expect(r.evidenceCount).toBe(2); // değişmedi
  });

  it("eşzamanlı aynı-ifade yarışı (canonicalKey P2002) ikinci proposal ÜRETMEZ", async () => {
    mockFindMany.mockResolvedValue([]); // in-memory dedup göremedi (yarış)
    mockCreate.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    mockFindUnique.mockResolvedValue(fact({ id: "winner", statement: "Emoji kullanma", evidenceCount: 1, createdBy: "feedback_pipeline" }));
    mockEvCount.mockResolvedValue(1);
    const r = await proposeFact({
      accountHandle: "grafikcem",
      type: "preference",
      statement: "Emoji kullanma",
      provenance: "operator",
      createdBy: "feedback_pipeline",
      evidence: { ...EV, sourceId: "fe-2" },
    });
    expect(r.outcome).toBe("corroborated");
    if (r.outcome === "corroborated") expect(r.factId).toBe("winner");
    expect(mockCreate).toHaveBeenCalledTimes(1); // ikinci create denenmedi
  });

  it("öğrenilmiş proposal <3 kaynaklı kanıtla ONAYLANAMAZ (server-side fail-closed)", async () => {
    mockFindUnique.mockResolvedValue(fact({ createdBy: "feedback_pipeline", status: "proposed" }));
    mockEvCount.mockResolvedValue(2);
    await expect(approveFact("f1")).rejects.toMatchObject({ code: "insufficient_evidence" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("3 kaynaklı kanıtla onay geçer", async () => {
    mockFindUnique.mockResolvedValue(fact({ createdBy: "feedback_pipeline", status: "proposed" }));
    mockEvCount.mockResolvedValue(3);
    await approveFact("f1");
    const upd = mockUpdate.mock.calls.find((c) => (c[0].where as { id: string }).id === "f1");
    expect((upd?.[0].data as { status: string }).status).toBe("active");
  });

  it("operatör 'Sahiplen' (operatorAssertion) eşiği aşar + assertion kanıtı yazar — tarihsel kaynak UYDURMAZ", async () => {
    mockFindUnique.mockResolvedValue(fact({ createdBy: "consolidation", status: "proposed", evidenceCount: 1 }));
    mockEvCount.mockResolvedValue(0); // eski kayıt, defter boş
    await approveFact("f1", "operator", { operatorAssertion: true });
    expect(mockEvCreate).toHaveBeenCalledTimes(1);
    const ev = mockEvCreate.mock.calls[0][0].data as { sourceType: string; signalType: string; sourceId: string };
    expect(ev.sourceType).toBe("operator_assertion");
    expect(ev.signalType).toBe("operator_adopt");
    expect(ev.sourceId).toBe("f1"); // beyan bu fact'e — geçmiş olaya değil
  });

  it("operatör kendi yazdığı kural (createdBy=operator) kanıt eşiği aramaz", async () => {
    mockFindUnique.mockResolvedValue(fact({ createdBy: "operator", status: "proposed" }));
    mockEvCount.mockResolvedValue(0);
    await expect(approveFact("f1")).resolves.toBeUndefined();
  });

  it("yanlış durumda approve/reject/rollback typed reddedilir", async () => {
    mockFindUnique.mockResolvedValue(fact({ status: "active" }));
    await expect(approveFact("f1")).rejects.toMatchObject({ code: "invalid_state" });
    await expect(rejectFact("f1")).rejects.toMatchObject({ code: "invalid_state" }); // aktif reddedilemez
    mockFindUnique.mockResolvedValue(fact({ status: "proposed", supersedesId: "old-1" }));
    await expect(rollbackFact("f1")).rejects.toMatchObject({ code: "invalid_state" }); // yalnız aktif geri alınır
    mockFindUnique.mockResolvedValue(fact({ status: "active", supersedesId: null }));
    await expect(rollbackFact("f1")).rejects.toMatchObject({ code: "invalid_state" }); // zincirsiz
  });
});

describe("supersede zinciri + rollback + revise (AC-4, §4.3 + ADR-029 atomik)", () => {
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
    expect(mockUpdate).not.toHaveBeenCalled(); // aktif fact'e DOKUNULMADI
  });

  it("approve supersede zincirini TEK transaction'da işletir", async () => {
    mockFindUnique.mockResolvedValue(fact({ id: "new-1", status: "proposed", supersedesId: "old-1", createdBy: "operator" }));
    await approveFact("new-1");
    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalled();
    const calls = mockUpdate.mock.calls;
    const oldCall = calls.find((c) => (c[0].where as { id: string }).id === "old-1");
    const newCall = calls.find((c) => (c[0].where as { id: string }).id === "new-1");
    expect((oldCall?.[0].data as { status: string }).status).toBe("superseded");
    expect((newCall?.[0].data as { status: string }).status).toBe("active");
  });

  it("rollback atomik geri sarar: yeni rejected, eski active + tInvalid=null", async () => {
    mockFindUnique.mockResolvedValue(fact({ id: "new-1", status: "active", supersedesId: "old-1" }));
    await rollbackFact("new-1");
    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalled();
    const calls = mockUpdate.mock.calls;
    const newCall = calls.find((c) => (c[0].where as { id: string }).id === "new-1");
    const oldCall = calls.find((c) => (c[0].where as { id: string }).id === "old-1");
    expect((newCall?.[0].data as { status: string }).status).toBe("rejected");
    expect((oldCall?.[0].data as { status: string }).status).toBe("active");
    expect((oldCall?.[0].data as { tInvalid: null }).tInvalid).toBeNull();
  });

  it("revise statement'ı YERİNDE değiştirmez: yeni aktif operator fact + eski superseded + revision kanıtı", async () => {
    mockFindUnique.mockResolvedValue(fact({ id: "old-1", status: "active", statement: "Emoji kullanma" }));
    const r = await reviseFact("old-1", "Emoji yalnız istisna durumlarda kullanılabilir");
    expect(r.newFactId).toBe("new-fact");
    // Yeni fact: active + operator + supersedesId=old-1.
    const created = mockCreate.mock.calls[0][0].data as { status: string; supersedesId: string; createdBy: string; statement: string };
    expect(created.status).toBe("active");
    expect(created.supersedesId).toBe("old-1");
    expect(created.createdBy).toBe("operator");
    // Eski fact yerinde MUTATE edilmedi — superseded'e geçti (statement update YOK).
    const oldUpd = mockUpdate.mock.calls.find((c) => (c[0].where as { id: string }).id === "old-1");
    expect((oldUpd?.[0].data as { status: string }).status).toBe("superseded");
    expect((oldUpd?.[0].data as { statement?: string }).statement).toBeUndefined();
    // Revision kanıtı yeni fact'e yazıldı.
    const ev = mockEvCreate.mock.calls[0][0].data as { sourceType: string; memoryFactId: string };
    expect(ev.sourceType).toBe("operator_revision");
    expect(ev.memoryFactId).toBe("new-fact");
  });

  it("revise yalnız aktif kuralda; aynı metin reddedilir", async () => {
    mockFindUnique.mockResolvedValue(fact({ status: "proposed" }));
    await expect(reviseFact("f1", "Yeni metin buraya")).rejects.toMatchObject({ code: "invalid_state" });
    mockFindUnique.mockResolvedValue(fact({ status: "active", statement: "Emoji kullanma" }));
    await expect(reviseFact("f1", "emoji KULLANMA")).rejects.toMatchObject({ code: "invalid_state" });
  });
});

describe("contradiction heuristiği", () => {
  it("aynı konu + zıt yön çelişki sayılır", () => {
    expect(looksContradictory("Thread sonunda soru sor", "Thread sonunda soru sorma")).toBe(true);
  });
  it("alakasız ifadeler çelişki değildir", () => {
    expect(looksContradictory("Emoji kullanma", "Fiyat kıyası işe yarıyor")).toBe(false);
  });
  it("isSameStatement fold'lu eşleşir; canonicalKey deterministik", () => {
    expect(isSameStatement("Emoji KULLANMA", "emoji kullanma")).toBe(true);
    expect(canonicalStatementKey("grafikcem", "preference", "Emoji KULLANMA")).toBe(
      canonicalStatementKey("grafikcem", "preference", "emoji  kullanma ")
    );
  });
});

describe("MemoryGovernanceError", () => {
  it("typed kod taşır", () => {
    const e = new MemoryGovernanceError("insufficient_evidence", "x");
    expect(e.code).toBe("insufficient_evidence");
  });
});
