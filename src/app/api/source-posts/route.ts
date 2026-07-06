import { NextRequest, NextResponse } from "next/server";
import { accountRepo } from "@/lib/db/accountRepo";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const accountHandle = searchParams.get("account");
    const status = searchParams.get("status") ?? "new";

    if (!accountHandle) {
      return NextResponse.json({ success: false, error: "account parametresi gerekli" }, { status: 400 });
    }

    const account = await accountRepo.findByHandle(accountHandle);
    if (!account) {
      return NextResponse.json({ success: false, error: `Hesap bulunamadı: ${accountHandle}` }, { status: 404 });
    }

    if (status !== "new") {
      return NextResponse.json({ success: false, error: "Sadece status=new destekleniyor" }, { status: 400 });
    }

    const posts = await sourcePostRepo.listNewByAccount(account.id, 50);

    return NextResponse.json({ success: true, posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SourcePost listesi alınamadı";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
