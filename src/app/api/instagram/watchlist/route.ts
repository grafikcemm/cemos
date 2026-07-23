import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import {
  addWatchAccount,
  isBusinessDiscoveryReady,
  IG_WATCHLIST_MAX,
} from "@/lib/instagram/competitor/igCompetitorService";

/**
 * IG rakip watchlist (Sprint 4 — CONTENT-ENGINE §3). GET: liste; POST: handle
 * ekle (business_discovery probe'lu — private/personal hesap throw değil,
 * Türkçe 'manuel ekle' bayrağı). Ekran sonraki sprint (Instagram alanı, C6).
 */

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const [accounts, configured] = await Promise.all([
      prisma.igWatchAccount.findMany({ orderBy: { addedAt: "desc" } }),
      isBusinessDiscoveryReady(),
    ]);
    // Watchlist GLOBALDİR (hesap-scoped değil) — UI "CemOS ortak rakip listesi"
    // olarak etiketler. `configured=false` → dürüst config-required durumu.
    return ok({ accounts, max: IG_WATCHLIST_MAX, configured, scope: "global" });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Watchlist alınamadı", 500);
  }
}

const AddSchema = z.object({
  username: z.string().min(1).max(40),
  isInspiration: z.boolean().optional(),
  isCompetitor: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = AddSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);

  try {
    const count = await prisma.igWatchAccount.count();
    if (count >= IG_WATCHLIST_MAX) {
      return fail(`Watchlist sınırı: en fazla ${IG_WATCHLIST_MAX} hesap`, 400);
    }
    const r = await addWatchAccount(parsed.data.username, parsed.data);
    return ok({ ...r });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(err instanceof Error ? err.message : "Hesap eklenemedi", 500);
  }
}
