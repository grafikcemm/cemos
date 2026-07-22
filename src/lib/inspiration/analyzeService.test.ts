import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Deterministik analiz persist sözleşmesi (Phase 3C §B): sahiplik fail-closed,
 * not-only kayıt dürüst red, versioned çıktı zarfta KALICI, ücretsiz (LLM
 * modülü hiç import edilmez — bu dosya generateGated mock'u bile gerektirmez).
 */

const biFindUnique = vi.fn();
const biUpdate = vi.fn();
const ciUpdate = vi.fn();
const scoreFindUnique = vi.fn();

vi.mock("@/lib/db/client", () => {
  const tx = {
    boardItem: { update: (a: unknown) => biUpdate(a) },
    contentItem: { update: (a: unknown) => ciUpdate(a) },
  };
  return {
    prisma: {
      boardItem: { findUnique: (a: unknown) => biFindUnique(a) },
      contentOutlierScore: { findUnique: (a: unknown) => scoreFindUnique(a) },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

import { analyzeInspirationItem } from "./analyzeService";
import { parseInspirationMeta } from "./inspirationMeta";

const CONTENT = {
  id: "ci-1",
  format: "ig_reel",
  body: "5 araç ile hızlan\n\n#ai",
  transcript: "",
  author: "rakip",
  mediaUrlsJson: "[]",
};

beforeEach(() => {
  vi.clearAllMocks();
  scoreFindUnique.mockResolvedValue(null);
  biUpdate.mockResolvedValue({});
  ciUpdate.mockResolvedValue({});
  biFindUnique.mockResolvedValue({
    id: "bi-1",
    note: "iyi hook",
    metaJson: "{}",
    board: { id: "b-1", accountId: "acc-1" },
    contentItem: CONTENT,
  });
});

describe("analyzeInspirationItem", () => {
  it("versioned analiz zarfta KALICI yazılır + analysisStatus=analyzed", async () => {
    const r = await analyzeInspirationItem({ accountId: "acc-1", boardItemId: "bi-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.analysis.analysisVersion).toBe("inspiration_structure.v1");
    const savedMeta = parseInspirationMeta(biUpdate.mock.calls[0][0].data.metaJson as string);
    expect(savedMeta?.analysis?.analysisVersion).toBe("inspiration_structure.v1");
    expect(ciUpdate.mock.calls[0][0].data.analysisStatus).toBe("analyzed");
  });

  it("cross-account → board_not_owned fail-closed, yazma yok", async () => {
    biFindUnique.mockResolvedValue({
      id: "bi-1",
      note: "",
      metaJson: "{}",
      board: { id: "b-1", accountId: "acc-OTHER" },
      contentItem: CONTENT,
    });
    const r = await analyzeInspirationItem({ accountId: "acc-1", boardItemId: "bi-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("board_not_owned");
    expect(biUpdate).not.toHaveBeenCalled();
  });

  it("içeriksiz not kaydı → dürüst no_content", async () => {
    biFindUnique.mockResolvedValue({
      id: "bi-1",
      note: "sadece not",
      metaJson: "{}",
      board: { id: "b-1", accountId: "acc-1" },
      contentItem: null,
    });
    const r = await analyzeInspirationItem({ accountId: "acc-1", boardItemId: "bi-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("no_content");
  });

  it("insufficient outlier skoru analize null-multiplier olarak taşınır (kanıt sayılmaz)", async () => {
    scoreFindUnique.mockResolvedValue({
      multiplier: 42,
      insufficient: true,
      sampleSize: 2,
      baselineMedian: 0,
      computedAt: new Date("2026-07-18T00:00:00Z"),
    });
    const r = await analyzeInspirationItem({ accountId: "acc-1", boardItemId: "bi-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.analysis.performanceAssessment.status).toBe("no_reliable_evidence");
    expect(r.analysis.performanceAssessment.multiplier).toBeNull();
  });

  it("zarfsız legacy kayıt ContentItem verisinden dürüst zarfla analiz edilir", async () => {
    biFindUnique.mockResolvedValue({
      id: "bi-1",
      note: "",
      metaJson: "eski-bozuk-json{",
      board: { id: "b-1", accountId: "acc-1" },
      contentItem: CONTENT,
    });
    const r = await analyzeInspirationItem({ accountId: "acc-1", boardItemId: "bi-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta.caption).toContain("5 araç");
  });
});
