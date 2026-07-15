import { describe, it, expect } from "vitest";
import { readinessInputFromQueueItem, assessQueueItemReadiness } from "./readinessAdapter";
import type { ReadinessQueueItemLike, ReadinessAccountLike } from "./readinessAdapter";

const account: ReadinessAccountLike = { handle: "grafikcem", maxChars: 280 };

function item(overrides: Partial<ReadinessQueueItemLike> = {}): ReadinessQueueItemLike {
  return {
    content: "Temiz taslak.",
    editedContent: null,
    status: "new",
    draftType: "TWEET",
    scores: JSON.stringify({ telemetry: { judged: true }, turkishNaturalness: 80, riskScore: 12, sourceFaithfulness: 85, leaks: [] }),
    lintReport: null,
    threadSegments: null,
    sourcePostId: null,
    newsItemId: null,
    ...overrides,
  };
}

describe("readinessAdapter — QueueItem → ReadinessInput mapping", () => {
  it("scores JSON'dan judged/TR/risk/kaynak-sadakati çıkarır", () => {
    const input = readinessInputFromQueueItem(item(), account);
    expect(input.judged).toBe(true);
    expect(input.turkishNaturalness).toBe(80);
    expect(input.riskScore).toBe(12);
    expect(input.sourceFaithfulness).toBe(85);
  });

  it("judged eksikse false (fail-closed); TR skoru yoksa null", () => {
    const input = readinessInputFromQueueItem(item({ scores: "{}" }), account);
    expect(input.judged).toBe(false);
    expect(input.turkishNaturalness).toBeNull();
  });

  it("bozuk scores JSON → boş (çökmeden judged=false)", () => {
    const input = readinessInputFromQueueItem(item({ scores: "not json" }), account);
    expect(input.judged).toBe(false);
    expect(input.riskScore).toBeNull();
  });

  it("riskScore alternatif anahtar (risk) da okunur", () => {
    const input = readinessInputFromQueueItem(item({ scores: JSON.stringify({ risk: 88 }) }), account);
    expect(input.riskScore).toBe(88);
  });

  it("hasSource yalnız sourcePostId/newsItemId varsa true", () => {
    expect(readinessInputFromQueueItem(item(), account).hasSource).toBe(false);
    expect(readinessInputFromQueueItem(item({ sourcePostId: "sp_1" }), account).hasSource).toBe(true);
    expect(readinessInputFromQueueItem(item({ newsItemId: "ni_1" }), account).hasSource).toBe(true);
  });

  it("threadSegments JSON parse edilir (geçersiz → null, fail-closed)", () => {
    const ok = readinessInputFromQueueItem(item({ threadSegments: JSON.stringify([{ text: "a" }, { text: "b" }]) }), account);
    expect(ok.threadSegments).toEqual([{ text: "a" }, { text: "b" }]);
    expect(readinessInputFromQueueItem(item({ threadSegments: "[]" }), account).threadSegments).toBeNull();
  });

  it("leaks {kind,severity,note} olarak normalize edilir", () => {
    const input = readinessInputFromQueueItem(
      item({ scores: JSON.stringify({ leaks: [{ type: "pii", severity: "high", message: "e-posta" }] }) }),
      account
    );
    expect(input.leaks).toEqual([{ kind: "pii", severity: "high", note: "e-posta" }]);
  });

  it("lintReport {issues:[...]} veya dizi olarak parse edilir", () => {
    const fromArray = readinessInputFromQueueItem(item({ lintReport: JSON.stringify([{ code: "banned_phrase", message: "x" }]) }), account);
    expect(fromArray.lintIssues).toEqual([{ code: "banned_phrase", severity: undefined, message: "x" }]);
    const fromObj = readinessInputFromQueueItem(item({ lintReport: JSON.stringify({ issues: [{ code: "security", severity: "error", message: "y" }] }) }), account);
    expect(fromObj.lintIssues).toEqual([{ code: "security", severity: "error", message: "y" }]);
  });

  it("maxChars = account.maxChars (platform sınırı)", () => {
    expect(readinessInputFromQueueItem(item(), { handle: "grafikcem", maxChars: 1500 }).maxChars).toBe(1500);
    expect(readinessInputFromQueueItem(item(), { handle: "grafikcem", maxChars: 0 }).maxChars).toBe(280);
  });

  it("eksik alanlar şema default'larına düşer (tek bozuk satır çökertmez)", () => {
    const bare = { scores: null, lintReport: null, threadSegments: null, sourcePostId: null, newsItemId: null } as unknown as ReadinessQueueItemLike;
    const input = readinessInputFromQueueItem(bare, account);
    expect(input.content).toBe("");
    expect(input.draftType).toBe("TWEET");
    expect(input.status).toBe("new");
  });

  it("uçtan uca: ready taslak → ready; judged=false → needs_edit", () => {
    expect(assessQueueItemReadiness(item(), account).state).toBe("ready");
    expect(assessQueueItemReadiness(item({ scores: "{}" }), account).state).toBe("needs_edit");
  });
});
