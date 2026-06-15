import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

type RankingRow = {
  rank?: number;
  model?: string;
  modelName?: string;
  provider?: string;
  score?: number;
  bestFor?: string;
  bestUseCase?: string;
  [key: string]: unknown;
};

// GET /api/ai-rankings
// Returns the most recent AiModelSnapshot's parsed rankings array.
export async function GET() {
  try {
    const snapshot = await prisma.aiModelSnapshot.findFirst({
      orderBy: [{ snapshotDate: "desc" }],
    });

    if (!snapshot) {
      return NextResponse.json({ success: true, snapshotDate: null, source: null, rankings: [] });
    }

    let rankings: RankingRow[] = [];
    try {
      const parsed = JSON.parse(snapshot.rankingsJson);
      if (Array.isArray(parsed)) rankings = parsed;
    } catch {
      rankings = [];
    }

    return NextResponse.json({
      success: true,
      snapshotDate: snapshot.snapshotDate,
      source: snapshot.source,
      rankings,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
