import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import {
  approveFact,
  rejectFact,
  rollbackFact,
  listProposals,
  MemoryScopeError,
} from "@/lib/memory/memoryFactService";

/**
 * Hafıza onay kuyruğu (Sprint 3 — FINAL-MEMORY-SPEC §6.3, C9: yeni top-level
 * ekran YOK; yüzey Settings içinde). GET: bekleyen proposal'lar + son aktif
 * kurallar; POST: approve | reject | rollback.
 */

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const accountHandle = req.nextUrl.searchParams.get("accountHandle") ?? undefined;
    const proposals = await listProposals(accountHandle);
    const active = await prisma.memoryFact.findMany({
      where: { status: "active", ...(accountHandle ? { accountHandle } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return ok({ proposals, active });
  } catch (err) {
    if (err instanceof MemoryScopeError) return fail(err.message, 400);
    return fail(err instanceof Error ? err.message : "Hafıza önerileri alınamadı", 500);
  }
}

const ActionSchema = z.object({
  action: z.enum(["approve", "reject", "rollback"]),
  factId: z.string().min(1).max(64),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = ActionSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);

  const { action, factId } = parsed.data;
  try {
    if (action === "approve") await approveFact(factId);
    else if (action === "reject") await rejectFact(factId);
    else await rollbackFact(factId);
    return ok({ action, factId });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "İşlem başarısız", 500);
  }
}
