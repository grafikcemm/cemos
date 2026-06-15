import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { draftService } from "@/lib/services/draftService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

const bodySchema = z.object({
  account: z.enum(["grafikcem", "maskulenkod"]),
});

// POST /api/toolbox/[id]/generate-idea
// Turn a toolbox resource into an X draft for the chosen account and push it
// onto the daily queue. The resource (title/description/useCase/url) becomes
// the grounding source. Mirrors news-pool/[id]/generate-draft. Budget is gated
// inside draftService.generateDraft (monthly getBudgetStatus).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Geçersiz istek (account gerekli)" }, { status: 400 });
  }

  try {
    const resource = await prisma.toolboxResource.findUnique({ where: { id } });
    if (!resource) {
      return NextResponse.json({ success: false, error: "Kaynak bulunamadı" }, { status: 404 });
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
      return NextResponse.json({ success: false, blocked: true, reason: result.reason }, { status: 200 });
    }

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
