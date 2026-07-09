import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { BudgetExceededError } from "@/lib/config/costGate";
import { reelDossierFor, ReelDailyLimitError } from "@/lib/reels/dossier-generator";

/**
 * Reels Dossier (Sprint 5 — CONTENT-ENGINE §4.2). GET: liste (readiness
 * rozetiyle); POST: on-demand üretim (cron'da ASLA). Liste UI'ı Instagram
 * alan ekranıyla gelir (C6); şimdilik operatör API'si.
 */

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const dossiers = await prisma.reelDossier.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        accountId: true,
        title: true,
        pillar: true,
        format: true,
        hook: true,
        finalReadiness: true,
        verificationId: true,
        expiry: true,
        costUsd: true,
        createdAt: true,
      },
    });
    return ok({ dossiers });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Dossier listesi alınamadı", 500);
  }
}

const CreateSchema = z.object({
  accountId: z.string().min(1).max(64),
  topic: z.string().min(3).max(2000),
  toolName: z.string().max(120).optional(),
  toolUrl: z.string().url().max(500).optional(),
  format: z.enum(["reel", "carousel", "reel+carousel"]).optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = CreateSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  const { accountId, topic, toolName, toolUrl, format } = parsed.data;
  if ((toolName && !toolUrl) || (!toolName && toolUrl)) {
    return fail("Araç için hem toolName hem toolUrl gerekli", 400);
  }

  try {
    const result = await reelDossierFor({
      accountId,
      topic,
      format,
      primaryTool: toolName && toolUrl ? { name: toolName, url: toolUrl } : undefined,
    });
    return ok({ ...result });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    if (err instanceof ReelDailyLimitError) return fail(err.message, 429, { code: err.code });
    return fail(err instanceof Error ? err.message : "Dossier üretilemedi", 500);
  }
}
