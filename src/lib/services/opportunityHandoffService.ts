import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import type { OpportunityHandoff } from "@/generated/prisma/client";

/**
 * OpportunityHandoff — kalıcı fırsat aktarım sözleşmesi (ADR-028, Faz 2A).
 *
 * Fırsatlar'daki üç eylem (İçerik üret / Plana ekle / Seriye ekle) artık
 * navigasyon+toast değil, SERVER-side persisted typed handoff'tur:
 *  - Reload sonrası kaybolmaz (Zustand/localStorage'a KONMAZ — DB satırı).
 *  - account+action+fingerprint unique → duplicate click duplicate kayıt üretmez.
 *  - consume/cancel idempotent state machine: pending → consumed | cancelled.
 *  - blockedReason fırsatı KAYBETMEDEN dış engeli işaretler (pending kalır).
 *  - payloadJson her okumada Zod + schemaVersion kontrolünden geçer.
 */

export const HANDOFF_SCHEMA_VERSION = "1";

export const HandoffActionSchema = z.enum(["generate", "plan", "series"]);
export type HandoffAction = z.infer<typeof HandoffActionSchema>;

export const HandoffStatusSchema = z.enum(["pending", "consumed", "cancelled"]);
export type HandoffStatus = z.infer<typeof HandoffStatusSchema>;

/** payloadJson içeriği — versiyonsuz/yabancı payload fail-closed reddedilir. */
export const HandoffPayloadSchema = z.object({
  schemaVersion: z.literal(HANDOFF_SCHEMA_VERSION),
});

export const CreateHandoffSchema = z.object({
  accountId: z.string().min(1),
  action: HandoffActionSchema,
  sourceKind: z.enum(["news", "youtube", "radar", "discovery"]),
  sourceId: z.string().min(1),
  sourcePlatform: z.string().default(""),
  title: z.string().min(1).max(500),
  topicSeed: z.string().max(2_000).default(""),
  whyNow: z.string().max(1_000).default(""),
  whyNowDetail: z.string().max(2_000).default(""),
  rawTab: z.string().max(60).default(""),
  suggestedPlatform: z.enum(["X", "Instagram", "Reels", "YouTube"]).default("X"),
  score: z.number().int().min(0).max(100).default(0),
  curationMethod: z.enum(["deterministic", "agent"]).default("deterministic"),
});
export type CreateHandoffInput = z.infer<typeof CreateHandoffSchema>;

export type HandoffFailureCode =
  | "not_found"
  | "already_consumed"
  | "cancelled"
  | "invalid_state"
  | "account_mismatch"
  | "plan_not_found"
  | "series_not_found";

export class HandoffFlowError extends Error {
  readonly code: HandoffFailureCode;
  constructor(code: HandoffFailureCode, message: string) {
    super(message);
    this.name = "HandoffFlowError";
    this.code = code;
  }
}

/** Aynı fırsat+aynı eylem = aynı parmak izi (dedup anahtarı). */
export function handoffFingerprint(input: Pick<CreateHandoffInput, "sourceKind" | "sourceId" | "topicSeed">): string {
  return createHash("sha256")
    .update(`${input.sourceKind}:${input.sourceId}:${(input.topicSeed ?? "").trim()}`)
    .digest("hex")
    .slice(0, 32);
}

export type HandoffRow = OpportunityHandoff;

function assertPayloadVersion(row: OpportunityHandoff): void {
  let raw: unknown;
  try {
    raw = JSON.parse(row.payloadJson);
  } catch {
    throw new HandoffFlowError("invalid_state", "Handoff payload'ı okunamadı (bozuk JSON).");
  }
  const parsed = HandoffPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HandoffFlowError("invalid_state", "Handoff payload sürümü desteklenmiyor.");
  }
}

export const opportunityHandoffService = {
  /**
   * Idempotent oluşturma: aynı (account, action, fingerprint) varsa yenisi
   * yaratılmaz. cancelled kayıt yeniden pending'e döner (kullanıcı yeniden
   * istedi); consumed kayıt olduğu gibi döner (sonucu zaten var).
   */
  async createHandoff(rawInput: unknown): Promise<{ handoff: HandoffRow; reused: boolean }> {
    const input = CreateHandoffSchema.parse(rawInput);
    const fingerprint = handoffFingerprint(input);

    const existing = await prisma.opportunityHandoff.findUnique({
      where: {
        accountId_action_fingerprint: { accountId: input.accountId, action: input.action, fingerprint },
      },
    });
    if (existing) {
      if (existing.status === "cancelled") {
        const revived = await prisma.opportunityHandoff.update({
          where: { id: existing.id },
          data: { status: "pending", blockedReason: null },
        });
        return { handoff: revived, reused: true };
      }
      return { handoff: existing, reused: true };
    }

    try {
      const handoff = await prisma.opportunityHandoff.create({
        data: {
          accountId: input.accountId,
          action: input.action,
          sourceKind: input.sourceKind,
          sourceId: input.sourceId,
          sourcePlatform: input.sourcePlatform,
          title: input.title,
          topicSeed: input.topicSeed,
          whyNow: input.whyNow,
          whyNowDetail: input.whyNowDetail,
          rawTab: input.rawTab,
          suggestedPlatform: input.suggestedPlatform,
          score: input.score,
          curationMethod: input.curationMethod,
          payloadJson: JSON.stringify({ schemaVersion: HANDOFF_SCHEMA_VERSION }),
          fingerprint,
        },
      });
      return { handoff, reused: false };
    } catch (e) {
      // Eşzamanlı çift tık: unique yarışını kaybeden mevcut satırı döner.
      const code = (e as { code?: string }).code;
      if (code === "P2002") {
        const winner = await prisma.opportunityHandoff.findUnique({
          where: {
            accountId_action_fingerprint: { accountId: input.accountId, action: input.action, fingerprint },
          },
        });
        if (winner) return { handoff: winner, reused: true };
      }
      throw e;
    }
  },

  async getById(id: string): Promise<HandoffRow | null> {
    return prisma.opportunityHandoff.findUnique({ where: { id } });
  },

  async list(opts: {
    action?: HandoffAction;
    status?: HandoffStatus;
    accountId?: string;
    resultRef?: string;
    limit?: number;
  }): Promise<HandoffRow[]> {
    return prisma.opportunityHandoff.findMany({
      where: {
        ...(opts.action ? { action: opts.action } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
        ...(opts.resultRef ? { resultRef: opts.resultRef } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(opts.limit ?? 20, 1), 100),
    });
  },

  /**
   * Idempotent tüketim. Optimistic claim: yalnız pending→consumed geçişi
   * yazar; kaybeden çağrı mevcut consumed satırı (aynı sonuçla) alır —
   * duplicate slot/ilişki oluşmaz. cancelled tüketilemez.
   */
  async consume(
    id: string,
    result: { resultQueueItemId?: string; resultRef?: string },
    tx?: Pick<typeof prisma, "opportunityHandoff">
  ): Promise<{ handoff: HandoffRow; alreadyConsumed: boolean }> {
    const db = tx ?? prisma;
    const row = await db.opportunityHandoff.findUnique({ where: { id } });
    if (!row) throw new HandoffFlowError("not_found", "Fırsat aktarımı bulunamadı.");
    assertPayloadVersion(row);
    if (row.status === "cancelled") {
      throw new HandoffFlowError("cancelled", "Bu fırsat aktarımı iptal edilmiş — Fırsatlar'dan yeniden başlat.");
    }

    const claim = await db.opportunityHandoff.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "consumed",
        consumedAt: new Date(),
        resultQueueItemId: result.resultQueueItemId ?? null,
        resultRef: result.resultRef ?? null,
        blockedReason: null,
      },
    });
    if (claim.count === 0) {
      // Yarışı kaybettik ya da zaten tüketilmiş → mevcut sonucu idempotent döndür.
      const current = await db.opportunityHandoff.findUnique({ where: { id } });
      if (current?.status === "consumed") return { handoff: current, alreadyConsumed: true };
      throw new HandoffFlowError("invalid_state", "Fırsat aktarımı tüketilemedi (durum değişti).");
    }
    const updated = await db.opportunityHandoff.findUnique({ where: { id } });
    return { handoff: updated!, alreadyConsumed: false };
  },

  /** İptal idempotent: pending→cancelled; consumed iptal edilemez. */
  async cancel(id: string): Promise<HandoffRow> {
    const row = await prisma.opportunityHandoff.findUnique({ where: { id } });
    if (!row) throw new HandoffFlowError("not_found", "Fırsat aktarımı bulunamadı.");
    if (row.status === "consumed") {
      throw new HandoffFlowError("already_consumed", "Tüketilmiş aktarım iptal edilemez.");
    }
    if (row.status === "cancelled") return row;
    return prisma.opportunityHandoff.update({ where: { id }, data: { status: "cancelled" } });
  },

  /** Dış engel: fırsat KAYBOLMAZ — pending kalır, neden görünür olur. */
  async markBlocked(id: string, reason: string): Promise<HandoffRow> {
    const row = await prisma.opportunityHandoff.findUnique({ where: { id } });
    if (!row) throw new HandoffFlowError("not_found", "Fırsat aktarımı bulunamadı.");
    if (row.status !== "pending") return row;
    return prisma.opportunityHandoff.update({ where: { id }, data: { blockedReason: reason } });
  },
};

/** Route'lar için code→HTTP eşlemesi (Türkçe, eyleme dönük). */
export function handoffErrorResponse(err: HandoffFlowError): { status: number; error: string; code: HandoffFailureCode } {
  const status: Record<HandoffFailureCode, number> = {
    not_found: 404,
    already_consumed: 409,
    cancelled: 409,
    invalid_state: 409,
    account_mismatch: 422,
    plan_not_found: 422,
    series_not_found: 422,
  };
  return { status: status[err.code], error: err.message, code: err.code };
}
