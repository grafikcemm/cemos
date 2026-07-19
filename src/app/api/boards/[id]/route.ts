import type { NextRequest } from "next/server";
import { z } from "zod";
import { boardRepo } from "@/lib/db/boardRepo";
import {
  saveContentToBoard,
  resolveBoardForSave,
  type SaveToBoardFailureCode,
  type ResolveBoardFailureCode,
} from "@/lib/boards/saveToBoard";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

/** Typed save/resolve failure → HTTP status (honest, distinct per state). */
function statusForCode(code: SaveToBoardFailureCode | ResolveBoardFailureCode): number {
  switch (code) {
    case "board_not_found":
    case "content_not_found":
      return 404;
    case "board_archived":
      return 409;
    case "board_scope_mismatch":
      return 403;
    default:
      return 400;
  }
}

// GET /api/boards/[id]  — board + sections + items (with canonical content).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  try {
    const board = await boardRepo.withItems(id);
    if (!board) {
      return fail("Bulunamadı", 404);
    }
    return ok({ board });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

const AddItemSchema = z.object({
  contentItemId: z.string().max(64).optional(),
  accountId: z.string().max(64).optional(),
  sectionId: z.string().max(64).optional(),
  itemType: z.string().max(40).optional(),
  title: z.string().max(500).optional(),
  url: z.string().max(2000).optional(),
  note: z.string().max(20000).optional(),
});

// POST /api/boards/[id]  — save an item to the board (save-to-board action).
// Canonical content (contentItemId) → hardened idempotent saveContentToBoard
// (scope + archived + dedup). Free items (url/note/image) → guarded addItem.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = AddItemSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  const input = parsed.data;
  try {
    if (input.contentItemId) {
      const result = await saveContentToBoard({
        contentItemId: input.contentItemId,
        boardId: id,
        accountId: input.accountId,
        sectionId: input.sectionId,
        title: input.title,
        note: input.note,
        savedFrom: "board_detail",
      });
      if (!result.ok) {
        return fail(result.message, statusForCode(result.code), { code: result.code });
      }
      return ok(
        { item: result.boardItem, created: result.created, alreadySaved: result.alreadySaved, board: result.board },
        { status: result.created ? 201 : 200 },
      );
    }

    // Free item (url/note/image): validate board scope + archived, then add.
    const resolved = await resolveBoardForSave({ boardId: id, accountId: input.accountId });
    if (!resolved.ok) {
      return fail(resolved.message, statusForCode(resolved.code), { code: resolved.code });
    }
    const item = await boardRepo.addItem({
      boardId: id,
      sectionId: input.sectionId,
      itemType: input.itemType,
      title: input.title,
      url: input.url,
      note: input.note,
    });
    return ok({ item, created: true, alreadySaved: false }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
