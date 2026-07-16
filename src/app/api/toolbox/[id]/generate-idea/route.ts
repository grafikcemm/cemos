import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { draftService } from "@/lib/services/draftService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { BudgetExceededError } from "@/lib/config/costGate";

const bodySchema = z.object({
  // ADR-031: hesap doğrulaması generateDraft içindeki DB profil yüklemesinde
  // fail-closed yapılır (bilinmeyen/draft hesap üretime giremez).
  account: z.string().min(1),
});

// POST /api/toolbox/[id]/generate-idea
// Turn a toolbox resource into an X draft for the chosen account and push it
// onto the daily queue. The resource (title/description/useCase/url) becomes
// the grounding source. Mirrors news-pool/[id]/generate-draft. Budget is gated
// inside draftService.generateDraft (monthly getBudgetStatus).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz istek (account gerekli)", 400);
  }

  // ADR-031: hesap DB'de doğrulanır (bilinmeyen/devre dışı → 400, fail-closed).
  const { isKnownAccountHandleDb } = await import("@/lib/accounts/profileRepository");
  if (!(await isKnownAccountHandleDb(parsed.data.account))) {
    return fail("Geçersiz hesap", 400);
  }

  try {
    const resource = await prisma.toolboxResource.findUnique({ where: { id } });
    if (!resource) {
      return fail("Kaynak bulunamadı", 404);
    }

    const grounding = [
      resource.title,
      resource.description,
      resource.whyUseful,
      resource.useCase ? `Kullanım: ${resource.useCase}` : "",
      resource.url,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await draftService.generateDraft({
      accountHandle: parsed.data.account,
      sourceTweet: grounding,
      sourceHandle: "toolbox",
      draftType: "TWEET",
    });

    if (result.blocked) {
      return fail("blocked", 200, { blocked: true, reason: result.reason });
    }

    return ok({ result });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
