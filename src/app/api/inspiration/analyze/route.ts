import type { NextRequest } from "next/server";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import {
  analyzeInspirationItem,
  AnalyzeInspirationSchema,
  type AnalyzeFailureCode,
} from "@/lib/inspiration/analyzeService";

export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 64 * 1024;

const FAILURE_STATUS: Record<AnalyzeFailureCode, number> = {
  not_found: 404,
  board_not_owned: 422,
  no_content: 422,
};

/**
 * POST /api/inspiration/analyze — ÜCRETSİZ deterministik yapısal analiz
 * (Phase 3C §B). LLM yok, ağ yok, ücretli çağrı yok; versioned çıktı
 * BoardItem.metaJson zarfına kalıcı yazılır. AI "Fikre dönüştür"den AYRI.
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
  const parsed = AnalyzeInspirationSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return fail("Geçersiz istek alanları", 400, { code: "invalid_fields" });
  }
  try {
    const result = await analyzeInspirationItem(parsed.data);
    if (!result.ok) {
      return fail(result.message, FAILURE_STATUS[result.code], { code: result.code });
    }
    return ok({ analysis: result.analysis });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}
