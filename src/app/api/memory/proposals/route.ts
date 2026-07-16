import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import {
  approveFact,
  rejectFact,
  rollbackFact,
  reviseFact,
  listProposals,
  proposeFact,
  canonicalStatementKey,
  MEMORY_FACT_TYPES,
  MemoryScopeError,
  MemoryGovernanceError,
} from "@/lib/memory/memoryFactService";

/**
 * Hafıza onay kuyruğu (Sprint 3 + Faz 2B ADR-029). GET: bekleyen proposal'lar
 * + son aktif kurallar; POST: add | approve | adopt | reject | rollback |
 * revise. Tüm mutasyonlar memoryFactService state machine'inden geçer —
 * doğrudan status yazımı YOK; öğrenilmiş proposal <3 kaynaklı kanıtla
 * onaylanamaz (server-side fail-closed).
 */

function governanceStatus(code: MemoryGovernanceError["code"]): number {
  switch (code) {
    case "not_found":
      return 404;
    case "account_mismatch":
      return 403;
    case "insufficient_evidence":
      return 422;
    case "duplicate_statement":
      return 409;
    default:
      return 409;
  }
}

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
  action: z.enum(["approve", "adopt", "reject", "rollback"]),
  factId: z.string().min(1).max(64),
  /** UI'nin aktif hesap bağlamı — cross-account mutasyonu servis reddeder. */
  accountHandle: z.string().min(1).max(40).optional(),
});

const ReviseSchema = z.object({
  action: z.literal("revise"),
  factId: z.string().min(1).max(64),
  statement: z.string().min(5).max(300),
  accountHandle: z.string().min(1).max(40).optional(),
});

// Operatör bootstrap yolu ("beni tanısın"): kullanıcı kendi kuralını doğrudan
// yazar. Yazan = onaylayan olduğundan proposed→active tek adımda tamamlanır;
// provenance HER ZAMAN "operator" (client'tan alınmaz — spoof edilemez).
// ADR-029: operatör beyanı deftere operator_assertion olarak işlenir.
const AddSchema = z.object({
  action: z.literal("add"),
  accountHandle: z.string().min(1).max(40),
  type: z.enum(MEMORY_FACT_TYPES),
  statement: z.string().min(5).max(300),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);

  const add = AddSchema.safeParse(body.data);
  if (add.success) {
    try {
      const r = await proposeFact({
        accountHandle: add.data.accountHandle,
        type: add.data.type,
        statement: add.data.statement,
        provenance: "operator",
        createdBy: "operator",
        evidence: {
          sourceType: "operator_assertion",
          sourceId: canonicalStatementKey(add.data.accountHandle, add.data.type, add.data.statement),
          signalType: "operator_add",
          direction: "operator",
          excerpt: add.data.statement,
        },
      });
      if (r.outcome === "created") {
        await approveFact(r.factId, "operator", { expectedAccountHandle: add.data.accountHandle });
      } else if (r.outcome === "corroborated") {
        // Aynı ifade öğrenilmiş proposal olarak beklemedeyse operatörün
        // doğrudan yazması = açık sahiplenme (adopt) — zaten aktifse no-op.
        await approveFact(r.factId, "operator", {
          expectedAccountHandle: add.data.accountHandle,
          operatorAssertion: true,
        }).catch((e) => {
          if (e instanceof MemoryGovernanceError && e.code === "invalid_state") return; // zaten aktif
          throw e;
        });
      }
      return ok({ action: "add", outcome: r.outcome });
    } catch (err) {
      if (err instanceof MemoryScopeError) return fail(err.message, 400);
      if (err instanceof MemoryGovernanceError) return fail(err.message, governanceStatus(err.code), { code: err.code });
      return fail(err instanceof Error ? err.message : "Kural eklenemedi", 500);
    }
  }

  const revise = ReviseSchema.safeParse(body.data);
  if (revise.success) {
    try {
      const r = await reviseFact(revise.data.factId, revise.data.statement, {
        expectedAccountHandle: revise.data.accountHandle,
      });
      return ok({ action: "revise", factId: revise.data.factId, newFactId: r.newFactId });
    } catch (err) {
      if (err instanceof MemoryGovernanceError) return fail(err.message, governanceStatus(err.code), { code: err.code });
      return fail(err instanceof Error ? err.message : "Kural düzenlenemedi", 500);
    }
  }

  const parsed = ActionSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);

  const { action, factId, accountHandle } = parsed.data;
  const opts = { expectedAccountHandle: accountHandle };
  try {
    if (action === "approve") await approveFact(factId, "operator", opts);
    else if (action === "adopt") await approveFact(factId, "operator", { ...opts, operatorAssertion: true });
    else if (action === "reject") await rejectFact(factId, opts);
    else await rollbackFact(factId, opts);
    return ok({ action, factId });
  } catch (err) {
    if (err instanceof MemoryGovernanceError) return fail(err.message, governanceStatus(err.code), { code: err.code });
    return fail(err instanceof Error ? err.message : "İşlem başarısız", 500);
  }
}
