import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { reverifyDossier } from "@/lib/reels/dossierProductionService";

export const dynamic = "force-dynamic";

/**
 * Guarded dossier re-verification (ADR-038 §C).
 *
 *  - URL SERVER-SIDE'dan (primaryToolJson / alternatives zarfı) çözülür —
 *    istemci keyfi URL veremez; bu endpoint fetch-proxy DEĞİLDİR.
 *  - LLM YOK, generation gate GEREKMEZ (yalnız Tier-1 HTTP doğrulaması).
 *  - Optimistic concurrency (expectedUpdatedAt) + advisory lock; yarışan
 *    sonuç mevcut durumu ezemez (409).
 *  - Başarısız doğrulama HTTP 200 + typed `outcome.status="verification_failed"`
 *    döner: işlem koştu, sonuç negatif — eski kanıt silinmez, bayat kanıt
 *    tazelenmez.
 */

const MAX_BODY_CHARS = 64 * 1024;

const VerifySchema = z.object({
  accountId: z.string().min(1).max(64),
  expectedUpdatedAt: z.string().min(10).max(40),
  forceRefresh: z.boolean().optional(),
  target: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("primary") }),
      z.object({ kind: z.literal("alternative"), alternativeId: z.string().min(1).max(64) }),
    ])
    .optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return fail("body_too_large", 413, { code: "body_too_large" });
  let json: unknown;
  try {
    json = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    return fail("Geçersiz JSON", 400);
  }
  const parsed = VerifySchema.safeParse(json);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);

  try {
    const r = await reverifyDossier({ dossierId: id, ...parsed.data });
    if (!r.ok) {
      const status =
        r.code === "not_found"
          ? 404
          : r.code === "stale"
            ? 409
            : 422; // account_mismatch | no_tool | alternative_not_found
      return fail(r.message, status, { code: r.code });
    }
    return ok({ outcome: r.outcome, updatedAt: r.updatedAt, production: r.production });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Doğrulama başarısız", 500);
  }
}
