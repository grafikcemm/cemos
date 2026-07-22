import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

/**
 * Canonical save-to-board contract (Phase 4B / ADR-041): idempotent save,
 * concurrent-duplicate backstop (P2002 → no-op), account-scope fail-closed,
 * shared-board allowed, archived rejected, default board, batch membership.
 */

const ciFindUnique = vi.fn();
const boardFindUnique = vi.fn();
const boardFindFirst = vi.fn();
const boardCreate = vi.fn();
const sectionFindUnique = vi.fn();
const biFindFirst = vi.fn();
const biCreate = vi.fn();
const biFindMany = vi.fn();
const queryRaw = vi.fn();
const txSpy = vi.fn();

vi.mock("@/lib/db/client", () => {
  const tx = {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    board: { findFirst: (a: unknown) => boardFindFirst(a), create: (a: unknown) => boardCreate(a) },
    boardItem: { findFirst: (a: unknown) => biFindFirst(a), create: (a: unknown) => biCreate(a) },
    boardSection: { findUnique: (a: unknown) => sectionFindUnique(a) },
  };
  return {
    prisma: {
      contentItem: { findUnique: (a: unknown) => ciFindUnique(a) },
      board: {
        findUnique: (a: unknown) => boardFindUnique(a),
        findFirst: (a: unknown) => boardFindFirst(a),
        create: (a: unknown) => boardCreate(a),
      },
      boardItem: {
        findFirst: (a: unknown) => biFindFirst(a),
        findMany: (a: unknown) => biFindMany(a),
      },
      boardSection: { findUnique: (a: unknown) => sectionFindUnique(a) },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
        txSpy();
        return fn(tx);
      },
    },
  };
});

import {
  saveContentToBoard,
  resolveBoardForSave,
  boardMembershipFor,
} from "./saveToBoard";

const CONTENT = { id: "ci-1", title: "Başlık", author: "@yazar", canonicalUrl: "https://x.com/a/1" };

beforeEach(() => {
  vi.clearAllMocks();
  ciFindUnique.mockResolvedValue(CONTENT);
  boardFindUnique.mockResolvedValue({ id: "b-1", accountId: "acc-1", archivedAt: null, name: "Pano" });
  boardFindFirst.mockResolvedValue(null);
  boardCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "b-def", archivedAt: null, ...a.data }),
  );
  sectionFindUnique.mockResolvedValue(null);
  queryRaw.mockResolvedValue([{ pg_advisory_xact_lock: null }]);
  biFindFirst.mockResolvedValue(null);
  biCreate.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: "bi-1", ...a.data }));
  biFindMany.mockResolvedValue([]);
});

describe("saveContentToBoard — happy path", () => {
  it("kanonik içeriği panoya kaydeder (created), advisory lock + tek tx", async () => {
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-1", accountId: "acc-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(true);
    expect(r.alreadySaved).toBe(false);
    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const data = biCreate.mock.calls[0][0].data;
    expect(data.contentItemId).toBe("ci-1");
    expect(data.itemType).toBe("content");
    expect(data.url).toBe("https://x.com/a/1");
    expect(data.title).toBe("Başlık");
  });

  it("başlık verilmezse ContentItem.title'a düşer", async () => {
    ciFindUnique.mockResolvedValue({ ...CONTENT, title: "" });
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-1", accountId: "acc-1" });
    expect(r.ok).toBe(true);
    expect(biCreate.mock.calls[0][0].data.title).toBe("@yazar");
  });
});

describe("saveContentToBoard — idempotency", () => {
  it("aynı içerik ikinci kez → ikinci BoardItem YOK, alreadySaved:true", async () => {
    biFindFirst.mockResolvedValue({ id: "bi-1", boardId: "b-1", contentItemId: "ci-1" });
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-1", accountId: "acc-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(false);
    expect(r.alreadySaved).toBe(true);
    expect(biCreate).not.toHaveBeenCalled();
  });

  it("eşzamanlı yarış: create P2002 → 500 DEĞİL, re-read ile idempotent no-op", async () => {
    // tx findFirst null (kayıt yok) → create yarış kaybeder → P2002 → dış re-read mevcut döner.
    biFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "bi-existing", boardId: "b-1", contentItemId: "ci-1" });
    biCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "x" }),
    );
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-1", accountId: "acc-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(false);
    expect(r.alreadySaved).toBe(true);
    expect(r.boardItem.id).toBe("bi-existing");
  });

  it("P2002 sonrası re-read de boş dönerse hata yutulmaz (throw)", async () => {
    biFindFirst.mockResolvedValue(null);
    biCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "x" }),
    );
    await expect(saveContentToBoard({ contentItemId: "ci-1", boardId: "b-1", accountId: "acc-1" })).rejects.toThrow();
  });
});

describe("saveContentToBoard — scope & validation", () => {
  it("hesap-scoped panoya BAŞKA hesap → board_scope_mismatch, tx açılmaz", async () => {
    boardFindUnique.mockResolvedValue({ id: "b-1", accountId: "acc-OTHER", archivedAt: null, name: "Pano" });
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-1", accountId: "acc-1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("board_scope_mismatch");
    expect(txSpy).not.toHaveBeenCalled();
  });

  it("hesap-scoped panoya accountId'siz istek → fail-closed scope_mismatch", async () => {
    boardFindUnique.mockResolvedValue({ id: "b-1", accountId: "acc-1", archivedAt: null, name: "Pano" });
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("board_scope_mismatch");
  });

  it("paylaşılan (accountId=null) panoya herkes kaydedebilir", async () => {
    boardFindUnique.mockResolvedValue({ id: "b-sh", accountId: null, archivedAt: null, name: "Ortak" });
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-sh", accountId: "acc-1" });
    expect(r.ok).toBe(true);
  });

  it("arşivlenmiş pano → board_archived, tx açılmaz", async () => {
    boardFindUnique.mockResolvedValue({ id: "b-1", accountId: "acc-1", archivedAt: new Date(), name: "Pano" });
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-1", accountId: "acc-1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("board_archived");
    expect(txSpy).not.toHaveBeenCalled();
  });

  it("pano yok → board_not_found", async () => {
    boardFindUnique.mockResolvedValue(null);
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-x", accountId: "acc-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("board_not_found");
  });

  it("içerik yok → content_not_found, pano bakılmaz", async () => {
    ciFindUnique.mockResolvedValue(null);
    const r = await saveContentToBoard({ contentItemId: "yok", boardId: "b-1", accountId: "acc-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("content_not_found");
    expect(boardFindUnique).not.toHaveBeenCalled();
  });

  it("başka panonun section'ı → reddedilir", async () => {
    sectionFindUnique.mockResolvedValue({ id: "s-1", boardId: "b-OTHER" });
    const r = await saveContentToBoard({ contentItemId: "ci-1", boardId: "b-1", accountId: "acc-1", sectionId: "s-1" });
    expect(r.ok).toBe(false);
  });
});

describe("saveContentToBoard — default board", () => {
  it("boardId yoksa paylaşılan 'Kaydedilenler' panosu get-or-create", async () => {
    const r = await saveContentToBoard({ contentItemId: "ci-1" });
    expect(r.ok).toBe(true);
    // ensure default → board.create (shared), sonra save tx.
    expect(boardCreate).toHaveBeenCalledTimes(1);
    expect(boardCreate.mock.calls[0][0].data.accountId).toBeNull();
    expect(boardCreate.mock.calls[0][0].data.name).toBe("Kaydedilenler");
  });

  it("default pano zaten varsa yeniden yaratılmaz", async () => {
    boardFindFirst.mockResolvedValue({ id: "b-def", accountId: null, archivedAt: null, name: "Kaydedilenler" });
    const r = await saveContentToBoard({ contentItemId: "ci-1" });
    expect(r.ok).toBe(true);
    expect(boardCreate).not.toHaveBeenCalled();
  });
});

describe("resolveBoardForSave", () => {
  it("shared board → ok", async () => {
    boardFindUnique.mockResolvedValue({ id: "b", accountId: null, archivedAt: null, name: "n" });
    const r = await resolveBoardForSave({ boardId: "b" });
    expect(r.ok).toBe(true);
  });
  it("cross-account → scope_mismatch", async () => {
    boardFindUnique.mockResolvedValue({ id: "b", accountId: "acc-A", archivedAt: null, name: "n" });
    const r = await resolveBoardForSave({ boardId: "b", accountId: "acc-B" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("board_scope_mismatch");
  });
});

describe("boardMembershipFor — batch, no N+1", () => {
  it("içerik→pano üyeliği tek sorguda, arşivli panolar hariç", async () => {
    biFindMany.mockResolvedValue([
      { contentItemId: "ci-1", board: { id: "b-1", name: "A", archivedAt: null } },
      { contentItemId: "ci-1", board: { id: "b-2", name: "B", archivedAt: null } },
      { contentItemId: "ci-2", board: { id: "b-3", name: "C", archivedAt: new Date() } },
    ]);
    const map = await boardMembershipFor(["ci-1", "ci-2", "ci-1"]);
    expect(biFindMany).toHaveBeenCalledTimes(1); // no N+1
    expect(map["ci-1"]).toHaveLength(2);
    expect(map["ci-2"]).toBeUndefined(); // archived filtered
  });

  it("boş girdi → sorgu yok", async () => {
    const map = await boardMembershipFor([]);
    expect(map).toEqual({});
    expect(biFindMany).not.toHaveBeenCalled();
  });
});
