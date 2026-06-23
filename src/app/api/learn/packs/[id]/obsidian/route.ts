import type { NextRequest } from "next/server";
import { learnService } from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { buildObsidianBundle } from "@/lib/learning/obsidian";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/learn/packs/[id]/obsidian — Obsidian markdown dosyaları (client ZIP'ler).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) {
    return fail("disabled", 404, { code: "disabled" });
  }
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const pack = await learnService.getPackDetail(id);
  if (!pack) {
    return fail("Bulunamadı", 404);
  }
  const bundle = buildObsidianBundle(pack, new Date().toISOString());
  return ok({ ...bundle });
}
