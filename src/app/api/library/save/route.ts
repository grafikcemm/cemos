import type { NextRequest } from "next/server";
import { z } from "zod";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { SaveSourceSchema, resolveSourceToContentItem } from "@/lib/boards/saveFromSource";
import { saveContentToBoard, type SaveToBoardFailureCode } from "@/lib/boards/saveToBoard";

export const dynamic = "force-dynamic";

/**
 * Unified "save to library / board" contract (Phase 4B / ADR-041).
 * ONE server endpoint for the Kütüphane/Tümü drawer AND all 5 research screens:
 * client sends a typed source ref → server resolves the authoritative row into a
 * canonical ContentItem → idempotent saveContentToBoard. Typed, distinct states.
 */

const BodySchema = z.object({
  source: SaveSourceSchema,
  boardId: z.string().min(1).max(64).optional(),
  accountId: z.string().min(1).max(64).optional(),
  title: z.string().max(500).optional(),
  note: z.string().max(20_000).optional(),
});

function statusForSave(code: SaveToBoardFailureCode): number {
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

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });

  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  const input = parsed.data;

  try {
    // 1) Resolve the source into a canonical ContentItem (server-authoritative).
    const resolved = await resolveSourceToContentItem(input.source);
    if (!resolved.ok) {
      const status = resolved.code === "source_not_found" ? 404 : 400;
      return fail(resolved.message, status, { code: resolved.code });
    }

    // 2) Idempotent save to the target (or shared default) board.
    const result = await saveContentToBoard({
      contentItemId: resolved.contentItem.id,
      boardId: input.boardId,
      accountId: input.accountId,
      title: input.title,
      note: input.note,
      savedFrom: `save:${input.source.kind}`,
    });
    if (!result.ok) {
      return fail(result.message, statusForSave(result.code), { code: result.code });
    }

    return ok(
      {
        item: result.boardItem,
        created: result.created,
        alreadySaved: result.alreadySaved,
        board: { id: result.board.id, name: result.board.name, accountId: result.board.accountId },
        contentItem: {
          id: result.contentItem.id,
          platform: result.contentItem.platform,
          format: result.contentItem.format,
          title: result.contentItem.title,
          canonicalUrl: result.contentItem.canonicalUrl,
        },
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
