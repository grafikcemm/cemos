import { prisma } from "@/lib/db/client";
import { igMessageRepo } from "@/lib/db/igMessageRepo";
import { ok } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/instagram/summary — morning kartı: yanıt bekleyen yorum + yeni DM sayısı
// Fail-open: DB erişilemezse (pool timeout, Neon soğuk başlatma) 500 yerine boş sayılarla 200.
export async function GET() {
  try {
    const [comments, dms] = await Promise.all([
      prisma.igComment.count({ where: { status: { in: ["new", "analyzed"] } } }),
      igMessageRepo.countNewInbound(),
    ]);
    return ok({ comments, dms });
  } catch (err) {
    console.error("[instagram/summary] DB erişilemedi, fail-open boş özet dönülüyor:", err);
    return ok({ comments: 0, dms: 0, degraded: true });
  }
}
