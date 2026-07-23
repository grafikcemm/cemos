import { describe, it, expect, vi, beforeEach } from "vitest";

const factFindMany = vi.fn();
const feFindMany = vi.fn();
const accountFindUnique = vi.fn();
const patternFindMany = vi.fn();
const trainingGroupBy = vi.fn();

vi.mock("@/lib/accounts/profileRepository", () =>
  import("@/lib/accounts/profileRepository.testDouble").then((m) =>
    m.createProfileRepositoryTestDouble()
  )
);

vi.mock("@/lib/db/client", () => ({
  prisma: {
    memoryFact: { findMany: (...a: unknown[]) => factFindMany(...a) },
    feedbackEvent: { findMany: (...a: unknown[]) => feFindMany(...a) },
    account: { findUnique: (...a: unknown[]) => accountFindUnique(...a) },
    viralPattern: { findMany: (...a: unknown[]) => patternFindMany(...a) },
    trainingExample: { groupBy: (...a: unknown[]) => trainingGroupBy(...a) },
  },
}));

import { buildKnowledgeReadModel } from "./knowledgeReadModel";
import { MemoryScopeError } from "./memoryFactService";

function factRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mf-1",
    accountHandle: "grafikcem",
    type: "preference",
    statement: "Emoji kullanma",
    confidence: 0.8,
    evidenceCount: 3,
    sourceProvenance: "operator",
    status: "active",
    supersedesId: null,
    createdBy: "operator",
    approvedBy: "operator",
    createdAt: new Date("2026-07-01"),
    updatedAt: new Date("2026-07-10"),
    evidence: [] as unknown[],
    ...overrides,
  };
}

function evidenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    sourceType: "feedback_event",
    sourceId: "fe-1",
    signalType: "not_my_tone",
    direction: "negative",
    excerpt: "ton dışı",
    metadataJson: JSON.stringify({ schemaVersion: "1", feedbackType: "not_my_tone" }),
    observedAt: new Date("2026-07-09"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  factFindMany.mockResolvedValue([]);
  feFindMany.mockResolvedValue([]);
  accountFindUnique.mockResolvedValue({ id: "acc-1" });
  patternFindMany.mockResolvedValue([]);
  trainingGroupBy.mockResolvedValue([]);
});

describe("buildKnowledgeReadModel (ADR-030)", () => {
  it("bilinmeyen hesap scope hatası", async () => {
    await expect(buildKnowledgeReadModel("evil")).rejects.toThrow(MemoryScopeError);
  });

  it("deterministik özet gerçek sayılardan türetilir (LLM değil)", async () => {
    factFindMany.mockResolvedValue([
      factRow({ id: "a" }),
      factRow({ id: "b", statement: "Kısa yaz" }),
      factRow({ id: "c", status: "proposed", createdBy: "feedback_pipeline" }),
    ]);
    patternFindMany.mockResolvedValue([
      { id: "vp-1", patternName: "Somut sayı hook'u", hookType: "sayı", emotion: "merak", platform: "x", validatedAt: new Date("2026-07-08"), validatedSupport: 5 },
    ]);
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.summary).toBe("@grafikcem için 2 aktif yazım kuralı ve 1 doğrulanmış performans dersi kullanıyorum.");
    expect(m.activeFacts).toHaveLength(2);
    expect(m.proposals).toHaveLength(1);
  });

  it("performans dersi identity'den AYRI bölümde; gerçek validatedSupport/tarih; uydurma p-value YOK", async () => {
    patternFindMany.mockResolvedValue([
      { id: "vp-1", patternName: "Somut sayı hook'u", hookType: "sayı", emotion: "merak", platform: "x", validatedAt: new Date("2026-07-08"), validatedSupport: 5 },
    ]);
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.performanceLessons[0]).toEqual({
      id: "vp-1",
      patternName: "Somut sayı hook'u",
      hookType: "sayı",
      emotion: "merak",
      platform: "x",
      validatedAt: new Date("2026-07-08").toISOString(),
      validatedSupport: 5,
    });
    // Sorgu yalnız validated + aktif pattern'leri ister (unvalidated GÖRÜNMEZ).
    const where = patternFindMany.mock.calls[0][0].where as { validatedAt: unknown; isActive: boolean };
    expect(where.validatedAt).toEqual({ not: null });
    expect(where.isActive).toBe(true);
  });

  it("kanıtsız eski fact legacyUnattributed=true (sahte kaynak üretilmez)", async () => {
    factFindMany.mockResolvedValue([factRow({ evidence: [], evidenceCount: 2, createdBy: "consolidation", status: "proposed" })]);
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.proposals[0].legacyUnattributed).toBe(true);
    expect(m.proposals[0].sourcedEvidenceCount).toBe(0);
    expect(m.proposals[0].reviewReady).toBe(false); // kanıtsız → onaylanamaz
    expect(m.proposals[0].evidence).toEqual([]);
  });

  it("reviewReady: öğrenilmiş öneri 3 kaynaklı kanıtla hazır; 2'de değil", async () => {
    const twoEv = [evidenceRow({ id: "e1", sourceId: "fe-1" }), evidenceRow({ id: "e2", sourceId: "fe-2" })];
    const threeEv = [...twoEv, evidenceRow({ id: "e3", sourceId: "fe-3" })];
    factFindMany.mockResolvedValue([
      factRow({ id: "p2", status: "proposed", createdBy: "feedback_pipeline", evidence: twoEv }),
      factRow({ id: "p3", status: "proposed", createdBy: "feedback_pipeline", evidence: threeEv, statement: "Kısa yaz" }),
    ]);
    feFindMany.mockResolvedValue([{ id: "fe-1" }, { id: "fe-2" }, { id: "fe-3" }]);
    const m = await buildKnowledgeReadModel("grafikcem");
    const p2 = m.proposals.find((p) => p.id === "p2")!;
    const p3 = m.proposals.find((p) => p.id === "p3")!;
    expect(p2.reviewReady).toBe(false);
    expect(p3.reviewReady).toBe(true);
  });

  it("kanıt kaynağı silinmişse sourceAvailable=false; bozuk metadata fail-closed işaretlenir", async () => {
    factFindMany.mockResolvedValue([
      factRow({
        evidence: [
          evidenceRow({ id: "e1", sourceId: "fe-var" }),
          evidenceRow({ id: "e2", sourceId: "fe-silinmis", metadataJson: "{bozuk" }),
        ],
      }),
    ]);
    feFindMany.mockResolvedValueOnce([{ id: "fe-var" }]); // identity bölümünün kaynak kontrolü
    const m = await buildKnowledgeReadModel("grafikcem");
    const evs = m.activeFacts[0].evidence;
    expect(evs.find((e) => e.id === "e1")!.sourceAvailable).toBe(true);
    expect(evs.find((e) => e.id === "e2")!.sourceAvailable).toBe(false);
    expect(evs.find((e) => e.id === "e2")!.metadataInvalid).toBe(true);
  });

  it("bölüm bazlı fail-soft: pattern sorgusu düşse identity yaşar", async () => {
    factFindMany.mockResolvedValue([factRow()]);
    patternFindMany.mockRejectedValue(new Error("db down"));
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.activeFacts).toHaveLength(1);
    expect(m.sectionErrors.some((s) => s.startsWith("performance:"))).toBe(true);
  });

  it("proposal influencesDrafts=false, aktif true (öneri taslağı etkileyemez)", async () => {
    factFindMany.mockResolvedValue([
      factRow({ id: "a", status: "active" }),
      factRow({ id: "p", status: "proposed", statement: "Öneri", createdBy: "feedback_pipeline" }),
    ]);
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.activeFacts[0].influencesDrafts).toBe(true);
    expect(m.proposals[0].influencesDrafts).toBe(false);
  });

  it("son sinyaller mekanik/explicit ayrımıyla özetlenir", async () => {
    feFindMany.mockResolvedValue([
      { id: "fe-1", feedbackType: "approved", reason: "Daily Queue editor feedback", createdAt: new Date() },
      { id: "fe-2", feedbackType: "not_my_tone", reason: "Ton çok kurumsal, samimi olmalı", createdAt: new Date() },
    ]);
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.recentSignals.counts).toEqual({ approved: 1, not_my_tone: 1 });
    expect(m.recentSignals.latest.find((s) => s.id === "fe-1")!.mechanical).toBe(true);
    expect(m.recentSignals.latest.find((s) => s.id === "fe-2")!.mechanical).toBe(false);
  });

  it("aday pattern'ler validatedAt=null ile AYRI listelenir (doğrulanmış derslerden farklı) — ADR-045", async () => {
    patternFindMany
      .mockResolvedValueOnce([]) // validated (call 0)
      .mockResolvedValueOnce([
        { id: "cp-1", patternName: "Liste hook'u", hookType: "liste", emotion: "merak", platform: "x", successScore: 72, usageCount: 4 },
      ]); // candidates (call 1)
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.performanceLessons).toHaveLength(0);
    expect(m.candidatePatterns).toEqual([
      { id: "cp-1", patternName: "Liste hook'u", hookType: "liste", emotion: "merak", platform: "x", successScore: 72, usageCount: 4 },
    ]);
    const candWhere = patternFindMany.mock.calls[1][0].where as { validatedAt: unknown; isActive: boolean };
    expect(candWhere.validatedAt).toBeNull(); // doğrulanmamış = aday
    expect(candWhere.isActive).toBe(true);
  });

  it("eğitim külliyatı label groupBy sayımlarından türetilir (boşsa 0, uydurma yok) — ADR-045", async () => {
    trainingGroupBy.mockResolvedValue([
      { label: "good", _count: { _all: 3 } },
      { label: "bad", _count: { _all: 1 } },
      { label: "edited", _count: { _all: 2 } },
    ]);
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.trainingCorpus).toEqual({ total: 6, good: 3, bad: 1, edited: 2 });
  });

  it("boş DB'de trainingCorpus tümü 0 (dürüst boş, sahte geçmiş yok)", async () => {
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.trainingCorpus).toEqual({ total: 0, good: 0, bad: 0, edited: 0 });
  });

  it("etkisizleştirilmiş sinyal ETKİN sayıma girmez, ayrı sayılır + reason/edit detayı verilir — ADR-045", async () => {
    feFindMany.mockResolvedValue([
      { id: "fe-1", feedbackType: "rejected", reason: "Ton çok kurumsal, samimi olmalı", editedContent: "yeni metin", editDistance: 0.4, neutralizedAt: null, createdAt: new Date() },
      { id: "fe-2", feedbackType: "not_my_tone", reason: "yanlış işaretlenmiş sinyal", editedContent: "", editDistance: null, neutralizedAt: new Date(), createdAt: new Date() },
    ]);
    const m = await buildKnowledgeReadModel("grafikcem");
    // etkin sayım yalnız fe-1; fe-2 etkisiz → counts'a girmez ama neutralizedCount'a sayılır
    expect(m.recentSignals.counts).toEqual({ rejected: 1 });
    expect(m.recentSignals.neutralizedCount).toBe(1);
    const s1 = m.recentSignals.latest.find((s) => s.id === "fe-1")!;
    expect(s1.reasonExcerpt).toBe("Ton çok kurumsal, samimi olmalı");
    expect(s1.hasEdit).toBe(true);
    expect(s1.editDistance).toBe(0.4);
    expect(s1.neutralized).toBe(false);
    expect(m.recentSignals.latest.find((s) => s.id === "fe-2")!.neutralized).toBe(true);
  });

  // ── Canlı fake-0 kapanışı (2026-07-23): DB-down fail-soft'a YUTULMAZ ──
  it("DB-unavailable bölüm hatası FIRLATILIR (200+sıfır diziler değil → route 503 db_unavailable)", async () => {
    factFindMany.mockRejectedValue(
      Object.assign(new Error("Can't reach database server at `ep-fake:5432`"), {
        name: "PrismaClientInitializationError",
      }),
    );
    await expect(buildKnowledgeReadModel("grafikcem")).rejects.toMatchObject({
      name: "PrismaClientInitializationError",
    });
  });

  it("DB-dışı bölüm hatası fail-soft kalır ve sectionErrors REDAKTE taşır (ham Prisma/host metni istemciye gitmez)", async () => {
    patternFindMany.mockRejectedValue(
      new Error("boom with secret postgresql://u:p@h.neon.tech/db inside"),
    );
    const m = await buildKnowledgeReadModel("grafikcem");
    expect(m.sectionErrors.some((s) => s.startsWith("performance:"))).toBe(true);
    const joined = m.sectionErrors.join(" ");
    expect(joined).not.toContain("u:p@h.neon.tech");
    expect(joined).toContain("[REDACTED]");
  });
});
