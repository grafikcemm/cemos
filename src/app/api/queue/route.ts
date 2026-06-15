import { NextRequest, NextResponse } from "next/server";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";

export async function GET(req: NextRequest) {
  const accountHandle = req.nextUrl.searchParams.get("account");
  if (!accountHandle) {
    return NextResponse.json({ success: false, error: "account param gerekli" }, { status: 400 });
  }

  try {
    const account = await accountRepo.findByHandle(accountHandle);
    if (!account) {
      return NextResponse.json({ success: false, error: "Hesap bulunamadı" }, { status: 404 });
    }
    const items = await queueRepo.listByAccount(account.id);
    return NextResponse.json({ success: true, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
