import type { NextRequest } from "next/server";
import { z } from "zod";
import { ideaRepo } from "@/lib/db/ideaRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/ideas?accountId=&status=&platform=&limit=
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const ideas = await ideaRepo.list({
      accountId: sp.get("accountId") ?? undefined,
      status: sp.get("status") ?? undefined,
      platform: sp.get("platform") ?? undefined,
      limit: Number(sp.get("limit")) || 50,
    });
    return ok({ count: ideas.length, ideas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

const CreateSchema = z.object({
  accountId: z.string().min(1),
  title: z.string().max(500).optional(),
  angle: z.string().max(2000).optional(),
  hook: z.string().max(2000).optional(),
  bodyOutline: z.string().max(20000).optional(),
  platform: z.string().max(40).optional(),
  format: z.string().max(40).optional(),
  objective: z.string().max(60).optional(),
  whyNow: z.string().max(2000).optional(),
  transformationType: z.string().max(40).optional(),
  sourceContentItemIds: z.array(z.string()).max(20).optional(),
});

// POST /api/ideas  — create an Idea (Adapt: kaynak→fikir, Draft'tan önce).
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = CreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  try {
    const idea = await ideaRepo.create(parsed.data);
    return ok({ idea }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
