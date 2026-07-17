import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { BudgetExceededError } from "@/lib/config/costGate";
import { reelDossierFor, ReelDailyLimitError } from "@/lib/reels/dossier-generator";

/**
 * Reels Dossier (Sprint 5 → ADR-036 Faz 3B). GET: HESAP-SCOPED liste; POST:
 * on-demand üretim (cron'da ASLA) — ürün kapısı kapalıyken typed blocked
 * (yalnız ENV adları). accountId artık DB'de doğrulanır.
 */

async function isValidAccountId(accountId: string): Promise<boolean> {
  const row = await prisma.account.findUnique({
    where: { id: accountId },
    select: { isActive: true },
  });
  return Boolean(row?.isActive);
}

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
  if (accountId === "") return fail("accountId gerekli", 400, { code: "account_required" });
  try {
    if (!(await isValidAccountId(accountId))) {
      return fail("Hesap bulunamadı veya pasif", 422, { code: "account_invalid" });
    }
    const dossiers = await prisma.reelDossier.findMany({
      where: { accountId },
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
        updatedAt: true,
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
  seriesKey: z.string().max(120).optional(),
  sourceHandoffId: z.string().max(64).optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = CreateSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  const { accountId, topic, toolName, toolUrl, format, seriesKey, sourceHandoffId } = parsed.data;
  if ((toolName && !toolUrl) || (!toolName && toolUrl)) {
    return fail("Araç için hem toolName hem toolUrl gerekli", 400);
  }

  try {
    const result = await reelDossierFor({
      accountId,
      topic,
      format,
      seriesKey,
      sourceHandoffId,
      primaryTool: toolName && toolUrl ? { name: toolName, url: toolUrl } : undefined,
    });
    switch (result.status) {
      case "blocked_gate":
        // Dürüst typed blocked: yalnız ENV adları, değer asla.
        return fail("Canlı üretim kapısı kapalı", 422, {
          code: "generation_gate_closed",
          missing: result.missing,
        });
      case "blocked_budget":
        return fail(result.message, 402, { code: "per_pass_budget" });
      case "account_invalid":
        return fail(result.message, 422, { code: result.code });
      case "series_not_found":
        return fail(result.message, 404, { code: "series_not_found" });
      case "failed":
        return fail(`Üretim başarısız (${result.failedStage})`, 502, {
          code: "generation_failed",
          issues: result.issues,
          costUsd: result.costUsd,
        });
      case "created":
        return ok({ ...result });
    }
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    if (err instanceof ReelDailyLimitError) return fail(err.message, 429, { code: err.code });
    return fail(err instanceof Error ? err.message : "Dossier üretilemedi", 500);
  }
}
