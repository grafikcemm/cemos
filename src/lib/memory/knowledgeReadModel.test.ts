import { describe, it, expect, vi, beforeEach } from "vitest";

const factFindMany = vi.fn();
const feFindMany = vi.fn();
const accountFindUnique = vi.fn();
const patternFindMany = vi.fn();

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
});
