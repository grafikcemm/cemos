import type { NextRequest } from "next/server";
import { z } from "zod";
import { boardRepo } from "@/lib/db/boardRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

// GET /api/boards?accountId=&savable=1  — list active boards (Swipe-file).
// savable=1 → shared + this account's boards (save-to-board picker set); default
// → account-scoped only (İlham keeps its own-account boards).
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const accountId = req.nextUrl.searchParams.get("accountId") ?? undefined;
  const savable = req.nextUrl.searchParams.get("savable") === "1";
  try {
    const boards = savable ? await boardRepo.listSavable(accountId) : await boardRepo.list(accountId);
    return ok({ count: boards.length, boards });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  accountId: z.string().optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(60).optional(),
});

// POST /api/boards  { name, accountId?, description?, icon? }
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = CreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  try {
    const board = await boardRepo.create(parsed.data);
    return ok({ board }, { status: 201 });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
