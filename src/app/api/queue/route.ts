import type { NextRequest } from "next/server";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export async function GET(req: NextRequest) {
  // Single-operator read: same-origin (UI) or cron-secret only. Closes the
  // anonymous exposure of unpublished drafts + scores (DH-005). Defense-in-depth
  // behind Vercel Deployment Protection.
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const accountHandle = req.nextUrl.searchParams.get("account");
  if (!accountHandle) {
    return fail("account param gerekli", 400);
  }

  try {
    const account = await accountRepo.findByHandle(accountHandle);
    if (!account) {
      return fail("Hesap bulunamadı", 404);
    }
    const items = await queueRepo.listByAccount(account.id);
    return ok({ items });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
