import type { NextRequest } from "next/server";
import { contentItemRepo } from "@/lib/db/contentItemRepo";
import { contentEmbeddingRepo } from "@/lib/db/contentEmbeddingRepo";
import { buildSearchableDoc, embedText, rankBySimilarity } from "@/lib/content/search";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

export const dynamic = "force-dynamic";

function parseVec(json: string): number[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as number[]) : [];
  } catch {
    return [];
  }
}

// GET /api/content/search?q=&limit=  — semantic search over canonical content.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const limit = Number(sp.get("limit")) || 20;
  if (!q) {
    return fail("q gerekli", 400);
  }
  try {
    const queryVec = embedText(q).values;
    const candidates = (await contentEmbeddingRepo.listAll()).map((e) => ({
      id: e.contentItemId,
      values: parseVec(e.embeddingJson),
    }));
    const hits = rankBySimilarity(queryVec, candidates, limit);
    const results = (
      await Promise.all(
        hits.map(async (h) => {
          const item = await contentItemRepo.getById(h.id);
          return item ? { score: Number(h.score.toFixed(4)), item } : null;
        }),
      )
    ).filter(Boolean);
    return ok({ count: results.length, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

// POST /api/content/search?action=reindex  — embed content items lacking embeddings.
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  if (req.nextUrl.searchParams.get("action") !== "reindex") {
    return fail("action=reindex gerekli", 400);
  }
  try {
    const ids = await contentEmbeddingRepo.missingContentItemIds(200);
    let embedded = 0;
    for (const id of ids) {
      const item = await contentItemRepo.getById(id);
      if (!item) continue;
      const doc = buildSearchableDoc(item);
      const e = embedText(doc);
      await contentEmbeddingRepo.upsert({
        contentItemId: id,
        model: e.model,
        dim: e.dim,
        values: e.values,
        searchableDoc: doc.slice(0, 8000),
      });
      embedded++;
    }
    return ok({ embedded, remaining: Math.max(0, ids.length - embedded) });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
