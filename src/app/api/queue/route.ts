import type { NextRequest } from "next/server";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { ok, fail } from "@/lib/utils/apiResponse";

export async function GET(req: NextRequest) {
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
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
