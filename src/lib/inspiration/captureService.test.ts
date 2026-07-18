import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Capture sözleşmesi (Phase 3C §A): atomik transaction, idempotent tekrar,
 * cross-account fail-closed, paylaşılan board reddi, manuel metrik provenance
 * (ContentItem.metricsJson'a SIZMAZ), default board idempotency.
 */

const accountFindUnique = vi.fn();
const boardFindUnique = vi.fn();
const boardFindFirst = vi.fn();
const boardCreate = vi.fn();
const ciFindUnique = vi.fn();
const ciCreate = vi.fn();
const ciUpdate = vi.fn();
const creatorUpsert = vi.fn();
const biFindFirst = vi.fn();
const biCreate = vi.fn();
const biUpdate = vi.fn();
const queryRaw = vi.fn();
const txSpy = vi.fn();

vi.mock("@/lib/db/client", () => {
  const tx = {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    contentItem: {
      findUnique: (a: unknown) => ciFindUnique(a),
      create: (a: unknown) => ciCreate(a),
      update: (a: unknown) => ciUpdate(a),
    },
    creator: { upsert: (a: unknown) => creatorUpsert(a) },
    boardItem: {
      findFirst: (a: unknown) => biFindFirst(a),
      create: (a: unknown) => biCreate(a),
      update: (a: unknown) => biUpdate(a),
    },
  };
  return {
    prisma: {
      account: { findUnique: (a: unknown) => accountFindUnique(a) },
      board: {
        findUnique: (a: unknown) => boardFindUnique(a),
        findFirst: (a: unknown) => boardFindFirst(a),
        create: (a: unknown) => boardCreate(a),
      },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
        txSpy();
        return fn(tx);
      },
    },
  };
});

import { captureInspiration, ensureInspirationBoard } from "./captureService";
import { parseInspirationMeta } from "./inspirationMeta";

const URL = "https://www.instagram.com/reel/Cxyz12345/";

beforeEach(() => {
  vi.clearAllMocks();
  accountFindUnique.mockResolvedValue({ id: "acc-1", handle: "grafikcem" });
  boardFindUnique.mockResolvedValue({ id: "b-1", accountId: "acc-1", archivedAt: null, name: "Pano" });
  queryRaw.mockResolvedValue([{ pg_advisory_xact_lock: null }]);
  ciFindUnique.mockResolvedValue(null);
  ciCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "ci-1", creatorId: null, ...a.data }),
  );
  ciUpdate.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: "ci-1", ...a.data }));
  creatorUpsert.mockResolvedValue({ id: "cr-1" });
  biFindFirst.mockResolvedValue(null);
  biCreate.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: "bi-1", ...a.data }));
  biUpdate.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: "bi-1", ...a.data }));
});

describe("captureInspiration", () => {
  it("ContentItem + BoardItem TEK transaction'da, advisory lock ile", async () => {
    const r = await captureInspiration({
      accountId: "acc-1",
      boardId: "b-1",
      url: URL,
      caption: "5 araç ile hızlan",
      creatorHandle: "@Rakip",
      manualMetrics: { likes: 1200 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(true);
    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    // externalId shortcode'dan; platform instagram (manual DEĞİL).
    const created = ciCreate.mock.calls[0][0].data;
    expect(created.platform).toBe("instagram");
    expect(created.externalId).toBe("shortcode_Cxyz12345");
    expect(created.sourceType).toBe("manual");
    // Manuel metrik ContentItem.metricsJson'a SIZMAZ.
    expect(created.metricsJson).toBe("{}");
    // Zarf: provenance operator_observed.
    const meta = parseInspirationMeta(biCreate.mock.calls[0][0].data.metaJson as string);
    expect(meta?.manualMetrics?.provenance).toBe("operator_observed");
    expect(meta?.manualMetrics?.likes).toBe(1200);
    expect(meta?.creatorHandle).toBe("rakip"); // normalize edildi
  });

  it("aynı gönderi ikinci kez → duplicate BoardItem YOK, mevcut kayıt güncellenir", async () => {
    biFindFirst.mockResolvedValue({ id: "bi-1", metaJson: "{}", note: "" });
    const r = await captureInspiration({ accountId: "acc-1", boardId: "b-1", url: URL });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(false);
    expect(biCreate).not.toHaveBeenCalled();
    expect(biUpdate).toHaveBeenCalledTimes(1);
  });

  it("cross-account board → fail-closed reddedilir, hiçbir yazma olmaz", async () => {
    boardFindUnique.mockResolvedValue({ id: "b-2", accountId: "acc-OTHER", archivedAt: null });
    const r = await captureInspiration({ accountId: "acc-1", boardId: "b-2", url: URL });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("board_not_owned");
    expect(txSpy).not.toHaveBeenCalled();
  });

  it("paylaşılan (accountId=null) board'a capture kapalı — dürüst sözleşme", async () => {
    boardFindUnique.mockResolvedValue({ id: "b-3", accountId: null, archivedAt: null });
    const r = await captureInspiration({ accountId: "acc-1", boardId: "b-3", url: URL });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("board_not_owned");
  });

  it("geçersiz host/path → invalid_url, transaction açılmaz", async () => {
    const r1 = await captureInspiration({ accountId: "acc-1", url: "https://evil.com/reel/Cxyz12345/" });
    const r2 = await captureInspiration({ accountId: "acc-1", url: "https://www.instagram.com/grafikcem/" });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(txSpy).not.toHaveBeenCalled();
  });

  it("hesap yoksa account_not_found (fail-closed)", async () => {
    accountFindUnique.mockResolvedValue(null);
    const r = await captureInspiration({ accountId: "yok", url: URL });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("account_not_found");
  });

  it("boardId verilmezse hesabın default 'Instagram İlham' panosu idempotent kullanılır", async () => {
    boardFindFirst.mockResolvedValue(null);
    boardCreate.mockResolvedValue({ id: "b-def", accountId: "acc-1", name: "Instagram İlham" });
    const r = await captureInspiration({ accountId: "acc-1", url: URL });
    expect(r.ok).toBe(true);
    expect(boardCreate).toHaveBeenCalledTimes(1);
    expect(boardCreate.mock.calls[0][0].data.accountId).toBe("acc-1");
  });

  it("mevcut zarftaki deterministik analiz yeniden capture'da KORUNUR", async () => {
    const existingMeta = {
      schemaVersion: "1",
      kind: "inspiration_capture",
      format: "ig_reel",
      formatSource: "operator",
      creatorHandle: "rakip",
      caption: "eski caption",
      transcript: "",
      manualMetrics: null,
      capturedAt: "2026-07-01T00:00:00.000Z",
      analysis: null,
    };
    biFindFirst.mockResolvedValue({ id: "bi-1", metaJson: JSON.stringify(existingMeta), note: "" });
    const r = await captureInspiration({ accountId: "acc-1", boardId: "b-1", url: URL, caption: "yeni caption" });
    expect(r.ok).toBe(true);
    const merged = parseInspirationMeta(biUpdate.mock.calls[0][0].data.metaJson as string);
    expect(merged?.caption).toBe("yeni caption");
    expect(merged?.capturedAt).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("ensureInspirationBoard", () => {
  it("mevcut panoyu döndürür, yenisini yaratmaz", async () => {
    boardFindFirst.mockResolvedValue({ id: "b-def", accountId: "acc-1" });
    const b = await ensureInspirationBoard("acc-1");
    expect(b.id).toBe("b-def");
    expect(boardCreate).not.toHaveBeenCalled();
  });
});
