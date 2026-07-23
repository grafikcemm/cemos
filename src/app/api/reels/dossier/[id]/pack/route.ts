import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { getDossierProductionState } from "@/lib/reels/dossierProductionService";
import { buildProductionPack } from "@/lib/reels/productionPack";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/reels/dossier/[id]/pack — onaylı dossier'ı deterministik Production
 * Pack DOSYALARINA assemble eder (ZIP paketleme istemcide — LearnExportPanel
 * deseni). READ-ONLY: DB yazımı YOK, LLM/render/ağ YOK, spend YOK, secret YOK.
 *
 * Gate (sahte-success yok): production state overall "approved" | "production_ready"
 * DEĞİLSE 409 + blocker'lar — yalnız İNSAN-ONAYLI içerik indirilebilir. Güncel
 * truth `getDossierProductionState`'ten türetilir (stored finalReadiness snapshot).
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
  if (accountId === "") return fail("accountId gerekli", 400, { code: "account_required" });
  try {
    const d = await prisma.reelDossier.findUnique({ where: { id } });
    if (!d) return fail("Dossier bulunamadı", 404, { code: "not_found" });
    if (d.accountId !== accountId) {
      return fail("Dossier bu hesaba ait değil", 422, { code: "account_mismatch" });
    }

    const production = await getDossierProductionState(d);
    if (production.overall !== "approved" && production.overall !== "production_ready") {
      return fail("Dossier henüz onaylı değil — Production Pack yalnız onaylı içerik için.", 409, {
        code: "not_approved",
        overall: production.overall,
        blockers: production.blockers,
      });
    }

    const pack = buildProductionPack(d);
    return ok({
      baseName: pack.baseName,
      format: pack.format,
      files: pack.files,
      manifest: pack.manifest,
      overall: production.overall,
    });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Production Pack üretilemedi", 500);
  }
}
