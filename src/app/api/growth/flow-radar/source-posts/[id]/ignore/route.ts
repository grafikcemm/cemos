import { NextRequest, NextResponse } from "next/server";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;

    const post = await sourcePostRepo.findById(id);
    if (!post) {
      return NextResponse.json({ success: false, error: "Gönderi bulunamadı" }, { status: 404 });
    }

    const updated = await sourcePostRepo.markIgnored(id);

    return NextResponse.json({
      success: true,
      post: updated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
