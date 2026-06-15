import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { igMessageRepo } from "@/lib/db/igMessageRepo";

export const dynamic = "force-dynamic";

// GET /api/instagram/summary — morning kartı: yanıt bekleyen yorum + yeni DM sayısı
// Fail-open: DB erişilemezse (pool timeout, Neon soğuk başlatma) 500 yerine boş sayılarla 200.
export async function GET() {
  try {
    const [comments, dms] = await Promise.all([
      prisma.igComment.count({ where: { status: { in: ["new", "analyzed"] } } }),
      igMessageRepo.countNewInbound(),
    ]);
    return NextResponse.json({ success: true, comments, dms });
  } catch (err) {
    console.error("[instagram/summary] DB erişilemedi, fail-open boş özet dönülüyor:", err);
    return NextResponse.json({ success: true, comments: 0, dms: 0, degraded: true });
  }
}
