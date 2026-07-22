import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { createDraftFromLearnIdea } from "@/lib/learning/draftBridge";

export const dynamic = "force-dynamic";

/**
 * POST /api/learn/packs/[id]/draft — Öğrenme paketi içerik fikri → X taslağı
 * (ADR-045). Deterministik ($0), idempotent, otomatik publish YOK. Fikir metni
 * SUNUCUDA paketten okunur (client içerik uydurmaz); yalnız ideaId + hedef hesap
 * gelir.
 */
const Schema = z.object({
  ideaId: z.string().min(1).max(16),
  accountHandle: z.string().min(1).max(40),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  if (!isLearnEnabled()) return fail("disabled", 404, { code: "disabled" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = Schema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);

  try {
    const r = await createDraftFromLearnIdea(id, parsed.data.ideaId, parsed.data.accountHandle);
    if (!r.ok) {
      const status = r.code === "account_not_found" ? 400 : 404;
      const msg = r.code === "account_not_found" ? "Hesap bulunamadı" : "Bulunamadı";
      return fail(msg, status, { code: r.code });
    }
    // Format-farkında sonuç: X taslağı (kind="draft") veya Instagram handoff
    // (kind="handoff" → Seriler/Takvim). Client hedefe göre deep-link eder.
    if (r.kind === "handoff") {
      return ok(
        { kind: "handoff", handoffId: r.handoffId, action: r.action, target: r.target, reused: r.reused },
        { status: r.reused ? 200 : 201 }
      );
    }
    return ok({ kind: "draft", draftId: r.draftId, reused: r.reused }, { status: r.reused ? 200 : 201 });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}
