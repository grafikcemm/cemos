import type { NextRequest } from "next/server";
import { assemblePackExport } from "@/lib/learning/packExport";
import { buildObsidianBundle } from "@/lib/learning/obsidian";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/learn/packs/[id]/obsidian — hazır (QA-geçmiş) pack'in Obsidian markdown
// dosyaları (client ZIP'ler). NOT-READY pack → 409 (istemci butonu gizlese de sunucu
// katmanı da reddeder; export yalnız "hazır bilgi"de). Deterministik: bundle stable.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) {
    return fail("disabled", 404, { code: "disabled" });
  }
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const pack = await assemblePackExport(id);
  if (!pack) {
    return fail("Bulunamadı", 404);
  }
  if (pack.status !== "ready") {
    return fail("Bu paket henüz hazır değil (QA geçmedi); dışa aktarılamaz.", 409, {
      code: "not_ready",
      status: pack.status,
    });
  }
  const bundle = buildObsidianBundle(pack);
  return ok({
    folderName: bundle.folderName,
    packId: bundle.packId,
    manifestHash: bundle.manifestHash,
    files: bundle.files.map((f) => ({ path: f.path, content: f.content })),
    meta: bundle.meta,
  });
}
