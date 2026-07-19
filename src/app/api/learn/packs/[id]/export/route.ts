import type { NextRequest } from "next/server";
import { z } from "zod";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { exportPackToChannel, channelStatuses, latestExportByChannel } from "@/lib/learning/exportService";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// Yazma kanalları (ZIP indirme ayrı GET /obsidian route'unda).
const BodySchema = z.object({
  channel: z.enum(["local_vault", "github_vault"]),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

// GET /api/learn/packs/[id]/export — kanal yapılandırma durumu + son export sonucu
// (UI paneli okur). Secret VALUE yok; env NAME + güvenli hedef etiketi + son durum.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) return fail("disabled", 404, { code: "disabled" });
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const [channels, latest] = await Promise.all([
    Promise.resolve(channelStatuses()),
    latestExportByChannel(id),
  ]);
  return ok({ channels, latest });
}

// POST /api/learn/packs/[id]/export — yerel/GitHub vault'a export (mutation).
// same-origin/operator auth + Zod + idempotencyKey + tipli audit'li sonuç. not-ready
// pack → not_ready durumu (yazma yok). Pack yok → 404.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isLearnEnabled()) return fail("disabled", 404, { code: "disabled" });
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Geçersiz istek gövdesi", 400, { code: "bad_json" });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Geçersiz kanal/istek", 422, { code: "invalid", issues: parsed.error.flatten() });
  }

  const outcome = await exportPackToChannel(id, parsed.data.channel, {
    idempotencyKey: parsed.data.idempotencyKey ?? null,
  });
  if (!outcome.ok) {
    return fail("Paket bulunamadı", 404, { code: "not_found" });
  }
  return ok({ result: outcome.result });
}
