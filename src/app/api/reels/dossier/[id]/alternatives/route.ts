import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import { addAlternative, archiveAlternative } from "@/lib/reels/alternativesService";
import { alternativeEvidenceState } from "@/lib/reels/alternatives";

export const dynamic = "force-dynamic";

/**
 * Alternatif araç zinciri işlemleri (ADR-038 §E): add + archive.
 * Doğrulama AYRI endpoint'te (/verify, target=alternative) — bu route ağ
 * çağrısı yapmaz. Manuel "verified" işareti yoktur; evidence durumu türetilir.
 * Arşivleme non-destructive; fiziksel DELETE yok.
 */

const MAX_BODY_CHARS = 64 * 1024;

const OpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    accountId: z.string().min(1).max(64),
    expectedUpdatedAt: z.string().min(10).max(40),
    name: z.string().trim().min(1).max(120),
    submittedUrl: z.string().url().max(500),
  }),
  z.object({
    op: z.literal("archive"),
    accountId: z.string().min(1).max(64),
    expectedUpdatedAt: z.string().min(10).max(40),
    alternativeId: z.string().min(1).max(64),
  }),
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return fail("body_too_large", 413, { code: "body_too_large" });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("Geçersiz JSON", 400);
  }
  const parsed = OpSchema.safeParse(json);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);

  try {
    const r =
      parsed.data.op === "add"
        ? await addAlternative({ dossierId: id, ...parsed.data })
        : await archiveAlternative({ dossierId: id, ...parsed.data });
    if (!r.ok) {
      const status =
        r.code === "not_found"
          ? 404
          : r.code === "stale"
            ? 409
            : 422; // account_mismatch | max_alternatives | duplicate_url | alternative_not_found
      return fail(r.message, status, { code: r.code });
    }
    const nowMs = Date.now();
    return ok({
      updatedAt: r.updatedAt,
      alreadyArchived: r.alreadyArchived ?? false,
      alternatives: r.alternatives.map((a) => ({
        ...a,
        evidenceState: alternativeEvidenceState(a, nowMs),
      })),
    });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Alternatif işlemi başarısız", 500);
  }
}
