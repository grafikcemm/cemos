import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { acquireXactAdvisoryLock } from "@/lib/db/advisoryLock";
import { Prisma } from "@/generated/prisma/client";
import type { Board, BoardItem, ContentItem } from "@/generated/prisma/client";

/**
 * Canonical save-to-board contract (Phase 4B / ADR-041).
 *
 * Single reusable path for "attach a canonical ContentItem to a Board":
 *   - Kütüphane/Tümü drawer save
 *   - Araştırma → Kütüphaneye kaydet köprüsü
 *   - (İlham capture keeps its own meta-merge flow but shares board resolution.)
 *
 * Invariants:
 *   - Board scope fail-closed: account-scoped board only accepts its own account;
 *     shared (accountId=null) board is explicitly open. No silent cross-account add.
 *   - Archived board rejected.
 *   - Idempotent: re-saving the same content to the same board is a no-op that
 *     honestly reports `alreadySaved` — no second BoardItem. Enforced at THREE
 *     layers: (1) tx advisory lock serializes same-key writers, (2) in-tx
 *     findFirst reuse, (3) DB unique index `(boardId, contentItemId)` backstops
 *     any cross-path race (P2002 → re-read, not a 500).
 *   - Non-destructive: never deletes; archive/no-op only.
 */

export const DEFAULT_LIBRARY_BOARD_NAME = "Kaydedilenler";
export const DEFAULT_LIBRARY_BOARD_ICON = "bookmark";

export type SaveToBoardFailureCode =
  | "board_not_found"
  | "board_archived"
  | "board_scope_mismatch"
  | "content_not_found";

export type SaveToBoardResult =
  | {
      ok: true;
      created: boolean;
      alreadySaved: boolean;
      board: Board;
      boardItem: BoardItem;
      contentItem: ContentItem;
    }
  | { ok: false; code: SaveToBoardFailureCode; message: string };

export type ResolveBoardFailureCode = "board_not_found" | "board_archived" | "board_scope_mismatch";

export type ResolveBoardResult =
  | { ok: true; board: Board }
  | { ok: false; code: ResolveBoardFailureCode; message: string };

export const SaveContentToBoardSchema = z.object({
  contentItemId: z.string().min(1).max(64),
  boardId: z.string().min(1).max(64).optional(),
  accountId: z.string().min(1).max(64).optional(),
  sectionId: z.string().min(1).max(64).optional(),
  title: z.string().max(500).optional(),
  note: z.string().max(20_000).optional(),
  /** Provenance: hangi yüzeyden kaydedildi (library / research:<kind>). */
  savedFrom: z.string().max(60).optional(),
});
export type SaveContentToBoardInput = z.infer<typeof SaveContentToBoardSchema>;

/**
 * Resolve + authorize a board for a save action. Shared by every save path so
 * scope/archived semantics are identical everywhere.
 *  - board shared (accountId=null) → any caller may save (explicit shared swipe file).
 *  - board account-scoped → requires a matching accountId; missing/mismatched
 *    accountId is fail-closed (we cannot prove ownership → refuse).
 */
export async function resolveBoardForSave(input: {
  boardId: string;
  accountId?: string | null;
}): Promise<ResolveBoardResult> {
  const board = await prisma.board.findUnique({ where: { id: input.boardId } });
  if (!board) return { ok: false, code: "board_not_found", message: "Pano bulunamadı." };
  if (board.archivedAt) return { ok: false, code: "board_archived", message: "Pano arşivlenmiş." };
  if (board.accountId !== null) {
    if (input.accountId == null) {
      return {
        ok: false,
        code: "board_scope_mismatch",
        message: "Bu pano bir hesaba ait — aktif hesap belirtilmeli.",
      };
    }
    if (board.accountId !== input.accountId) {
      return { ok: false, code: "board_scope_mismatch", message: "Bu pano aktif hesaba ait değil." };
    }
  }
  return { ok: true, board };
}

/**
 * Atomic get-or-create of the shared default library board ("Kaydedilenler").
 * Advisory lock closes the findFirst→create race (non-unique board.name).
 * accountId omitted → shared (null); provided → per-account default.
 */
export async function ensureDefaultLibraryBoard(accountId?: string | null): Promise<Board> {
  const scope = accountId ?? null;
  return prisma.$transaction(async (tx) => {
    const lockKey = `board_default:${scope ?? "shared"}`;
    await acquireXactAdvisoryLock(tx, lockKey);
    const existing = await tx.board.findFirst({
      where: { name: DEFAULT_LIBRARY_BOARD_NAME, accountId: scope, archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing;
    return tx.board.create({
      data: { name: DEFAULT_LIBRARY_BOARD_NAME, accountId: scope, icon: DEFAULT_LIBRARY_BOARD_ICON },
    });
  });
}

function buildSaveMeta(input: SaveContentToBoardInput): string {
  return JSON.stringify({ v: 1, kind: "board_save", savedFrom: input.savedFrom ?? "library" });
}

/**
 * Save a canonical ContentItem to a board (idempotent, scope-checked, atomic).
 * No boardId → shared default library board. Returns a typed result; callers map
 * `code` to HTTP status. Never throws for expected states.
 */
export async function saveContentToBoard(rawInput: unknown): Promise<SaveToBoardResult> {
  const input = SaveContentToBoardSchema.parse(rawInput);

  const contentItem = await prisma.contentItem.findUnique({ where: { id: input.contentItemId } });
  if (!contentItem) {
    return { ok: false, code: "content_not_found", message: "İçerik bulunamadı." };
  }

  let board: Board;
  if (input.boardId) {
    const resolved = await resolveBoardForSave({ boardId: input.boardId, accountId: input.accountId });
    if (!resolved.ok) return resolved;
    board = resolved.board;
  } else {
    // Quick-save with no target → shared default swipe file.
    board = await ensureDefaultLibraryBoard(null);
  }

  // Optional section must belong to the resolved board (fail-closed).
  if (input.sectionId) {
    const section = await prisma.boardSection.findUnique({ where: { id: input.sectionId } });
    if (!section || section.boardId !== board.id) {
      return { ok: false, code: "board_not_found", message: "Bölüm bu panoya ait değil." };
    }
  }

  const title = input.title?.trim() || contentItem.title || contentItem.author || "";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lockKey = `board_save:${board.id}:${contentItem.id}`;
      await acquireXactAdvisoryLock(tx, lockKey);

      const existing = await tx.boardItem.findFirst({
        where: { boardId: board.id, contentItemId: contentItem.id },
      });
      if (existing) {
        return { boardItem: existing, created: false };
      }

      const boardItem = await tx.boardItem.create({
        data: {
          boardId: board.id,
          contentItemId: contentItem.id,
          sectionId: input.sectionId ?? null,
          itemType: "content",
          title,
          url: contentItem.canonicalUrl ?? "",
          note: input.note ?? "",
          metaJson: buildSaveMeta(input),
        },
      });
      return { boardItem, created: true };
    });
    return {
      ok: true,
      created: result.created,
      alreadySaved: !result.created,
      board,
      boardItem: result.boardItem,
      contentItem,
    };
  } catch (err) {
    // Cross-path race backstop: the DB unique index rejected a concurrent
    // duplicate. Re-read and report idempotent success, not a 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.boardItem.findFirst({
        where: { boardId: board.id, contentItemId: contentItem.id },
      });
      if (existing) {
        return {
          ok: true,
          created: false,
          alreadySaved: true,
          board,
          boardItem: existing,
          contentItem,
        };
      }
    }
    throw err;
  }
}

/**
 * Batch board-membership lookup for a set of content items (no N+1).
 * Returns a map contentItemId → boards it already belongs to (id + name).
 */
export async function boardMembershipFor(
  contentItemIds: string[],
): Promise<Record<string, Array<{ boardId: string; boardName: string }>>> {
  const ids = [...new Set(contentItemIds.filter((v) => v))];
  if (ids.length === 0) return {};
  const rows = await prisma.boardItem.findMany({
    where: { contentItemId: { in: ids } },
    select: { contentItemId: true, board: { select: { id: true, name: true, archivedAt: true } } },
  });
  const map: Record<string, Array<{ boardId: string; boardName: string }>> = {};
  for (const r of rows) {
    if (!r.contentItemId || r.board.archivedAt) continue;
    (map[r.contentItemId] ??= []).push({ boardId: r.board.id, boardName: r.board.name });
  }
  return map;
}
