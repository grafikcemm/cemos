import type { NextRequest } from "next/server";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import {
  captureInspiration,
  CaptureInspirationSchema,
  type CaptureFailureCode,
} from "@/lib/inspiration/captureService";

export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 256 * 1024;

const FAILURE_STATUS: Record<CaptureFailureCode, number> = {
  invalid_url: 400,
  account_not_found: 422,
  board_not_found: 404,
  board_not_owned: 422,
  board_archived: 409,
};

/**
 * POST /api/inspiration/capture — account-scoped ATOMİK ilham yakalama
 * (Phase 3C §A). URL fetch edilmez, scraping yok; ContentItem+BoardItem tek
 * transaction; retry/çift-tık duplicate üretmez. Otomatik AI çağrısı YOK.
 */
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) {
    return fail("body_too_large", 413, { code: "body_too_large" });
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return fail("Geçersiz JSON", 400, { code: "invalid_json" });
  }
  const parsed = CaptureInspirationSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return fail("Geçersiz istek alanları", 400, { code: "invalid_fields", detail: parsed.error.flatten() });
  }
  try {
    const result = await captureInspiration(parsed.data);
    if (!result.ok) {
      return fail(result.message, FAILURE_STATUS[result.code], { code: result.code });
    }
    return ok(
      {
        created: result.created,
        board: { id: result.board.id, name: result.board.name },
        boardItem: { id: result.boardItem.id },
        contentItem: { id: result.contentItem.id, externalId: result.contentItem.externalId },
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}
