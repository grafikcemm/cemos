import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { generateCarouselEpisode } from "@/lib/series/carouselGenerator";

/**
 * Seri-temelli carousel bölüm üretimi (ADR-036 §C/§F). Ürün kapısı kapalıyken
 * typed blocked (yalnız ENV adları); kapı açıkken buildCarouselPrompt +
 * strict Zod + deterministik doğrulama. Cron'dan ASLA çağrılmaz.
 */

const GenerateSchema = z.object({
  accountId: z.string().min(1).max(64),
  seriesKey: z.string().min(1).max(120),
  topic: z.string().min(3).max(2000),
  sourceHandoffId: z.string().max(64).optional(),
  toolName: z.string().max(120).optional(),
  toolUrl: z.string().url().max(500).optional(),
  expectedSeriesVersion: z.number().int().min(1),
  expectedPromptVersion: z.string().min(1).max(20),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = GenerateSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  const { toolName, toolUrl, ...rest } = parsed.data;
  if ((toolName && !toolUrl) || (!toolName && toolUrl)) {
    return fail("Araç için hem toolName hem toolUrl gerekli", 400);
  }

  try {
    const r = await generateCarouselEpisode({
      ...rest,
      tool: toolName && toolUrl ? { name: toolName, url: toolUrl } : undefined,
    });
    switch (r.status) {
      case "blocked_gate":
        return fail("Canlı üretim kapısı kapalı", 422, {
          code: "generation_gate_closed",
          missing: r.missing,
        });
      case "blocked_budget":
        return fail(r.message, 402, { code: "per_pass_budget" });
      case "account_invalid":
        return fail(r.message, 422, { code: r.code });
      case "series_not_found":
        return fail(r.message, 404, { code: "series_not_found" });
      case "series_conflict":
        return fail(r.message, 409, { code: "series_conflict" });
      case "blocked_evidence":
        return fail(`Araç kanıtı doğrulanamadı: ${r.reason}`, 422, { code: "blocked_evidence" });
      case "already_exists":
        return ok({ ...r });
      case "invalid_output":
        return fail("Üretim geçerli çıktı vermedi", 502, {
          code: "generation_failed",
          issues: r.issues,
          costUsd: r.costUsd,
        });
      case "created":
        return ok({ ...r });
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Üretim başarısız", 500);
  }
}
