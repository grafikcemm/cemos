import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  reverseEngineerToIdea,
  ReverseEngineerBlockedError,
  ReverseEngineerInvalidOutputError,
} from "@/lib/content/reverseEngineer";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { budgetErrorResponse } from "@/lib/utils/budgetErrorResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  accountId: z.string().min(1),
  platform: z.string().max(40).optional(),
  format: z.string().max(40).optional(),
});

// POST /api/content/[id]/reverse-engineer  { accountId, platform?, format? }
// Eden "Adapt": analyze why the content worked → produce an Idea (not a draft).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = BodySchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  try {
    const result = await reverseEngineerToIdea({ contentItemId: id, ...parsed.data });
    return ok({ ...result }, { status: result.reused ? 200 : 201 });
  } catch (err) {
    // ADR-036 kapısı kapalı: yalnız ENV ADLARI döner (değer asla) — ağ çağrısı yapılmadı.
    if (err instanceof ReverseEngineerBlockedError) {
      return fail(err.message, 503, { code: err.code, missing: err.missing });
    }
    if (err instanceof ReverseEngineerInvalidOutputError) {
      return fail(err.message, 422, { code: err.code });
    }
    const budgetRes = budgetErrorResponse(err);
    if (budgetRes) return budgetRes;
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    const status = msg.includes("not found") ? 404 : 500;
    return fail(msg, status);
  }
}
