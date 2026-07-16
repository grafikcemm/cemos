import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import {
  HandoffFlowError,
  handoffErrorResponse,
  opportunityHandoffService,
} from "@/lib/services/opportunityHandoffService";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ seriesKey: z.string().min(1).max(120) });

// POST /api/opportunities/handoff/[id]/consume-series
// Seriye-ekle onayı: kullanıcı hedef seriyi SEÇTİKTEN sonra çağrılır.
// Seri = DNA şablonu (bölüm koleksiyonu değil, ADR-028) — kalıcı ilişki
// handoff satırının kendisidir: status=consumed + resultRef=seriesKey.
// Seriler ekranı seriye bağlı aday konuları bu kayıtlardan listeler.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON gövdesi", 400);
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz seri anahtarı.", 422, { code: "invalid_input" });

  try {
    const handoff = await opportunityHandoffService.getById(id);
    if (!handoff) return fail("Fırsat aktarımı bulunamadı.", 404, { code: "not_found" });
    if (handoff.action !== "series") {
      return fail("Bu aktarım seri için değil.", 422, { code: "invalid_state" });
    }
    if (handoff.status === "consumed") {
      return ok({ alreadyConsumed: true, seriesKey: handoff.resultRef });
    }

    // Cross-account sızıntı koruması: seri AYNI hesaba ait olmalı.
    const series = await prisma.seriesProfile.findFirst({
      where: { seriesKey: parsed.data.seriesKey, accountId: handoff.accountId, isActive: true },
    });
    if (!series) {
      throw new HandoffFlowError(
        "series_not_found",
        "Bu hesaba ait aktif seri bulunamadı — önce Seriler'den bir seri oluştur."
      );
    }

    const { handoff: consumed, alreadyConsumed } = await opportunityHandoffService.consume(handoff.id, {
      resultRef: series.seriesKey,
    });
    return ok({ seriesKey: consumed.resultRef, alreadyConsumed }, { status: alreadyConsumed ? 200 : 201 });
  } catch (err) {
    if (err instanceof HandoffFlowError) {
      const r = handoffErrorResponse(err);
      return fail(r.error, r.status, { code: r.code });
    }
    return fail(err instanceof Error ? err.message : "Sunucu hatası", 500);
  }
}
