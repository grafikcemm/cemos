import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { buildKnowledgeReadModel } from "@/lib/memory/knowledgeReadModel";
import { MemoryScopeError } from "@/lib/memory/memoryFactService";

export const dynamic = "force-dynamic";

// GET /api/memory/knowledge?accountHandle=grafikcem
// Kaynaklı "CemOS benim hakkımda ne biliyor?" read modeli (ADR-030) —
// deterministik özet + aktif kurallar + bekleyen öneriler (kanıt defteriyle)
// + doğrulanmış performans dersleri + son sinyaller. Secret/credential YOK.
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const accountHandle = req.nextUrl.searchParams.get("accountHandle") ?? "";
  if (!accountHandle) return fail("accountHandle gerekli", 422, { code: "invalid_input" });
  try {
    const model = await buildKnowledgeReadModel(accountHandle);
    return ok({ knowledge: model });
  } catch (err) {
    if (err instanceof MemoryScopeError) return fail(err.message, 400, { code: "invalid_scope" });
    return fail(err instanceof Error ? err.message : "Hafıza bilgisi alınamadı", 500);
  }
}
