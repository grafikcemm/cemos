import type { NextRequest } from "next/server";
import { z } from "zod";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { getInspirationWorkspace } from "@/lib/inspiration/workspaceService";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  accountId: z.string().min(1).max(64),
  boardId: z.string().min(1).max(64).optional(),
});

/**
 * GET /api/inspiration?accountId=&boardId=
 * Kütüphane→İlham çalışma alanı (Phase 3C): panolar + kayıtlar + watchlist
 * özeti + outlier feed + AI kapısının dürüst durumu. SIFIR yazma.
 */
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const sp = req.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    accountId: sp.get("accountId") ?? undefined,
    boardId: sp.get("boardId") ?? undefined,
  });
  if (!parsed.success) {
    return fail("accountId zorunlu", 400, { code: "invalid_query" });
  }
  try {
    const workspace = await getInspirationWorkspace(parsed.data);
    return ok({ workspace });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}
