import { prisma } from "@/lib/db/client";
import type { LearnExportAttempt } from "@/generated/prisma/client";

/**
 * CemOS Learn — Obsidian export denemesi repo'su (4D). Kanal başına (pack + hedef +
 * manifest) TEK satır: aynı manifest retry duplicate satır ÜRETMEZ (composite upsert
 * → already_current idempotency). idempotencyKey client çift-gönderim koruması (service
 * önce findByIdempotencyKey ile kontrol eder). Secret/token/tam-path SAKLANMAZ.
 */

export type RecordExportInput = {
  packId: string;
  channel: string;
  targetFingerprint: string;
  manifestHash: string;
  state: string;
  writtenCount: number;
  unchangedCount: number;
  failedCount: number;
  conflictCount: number;
  errorClass?: string | null;
  idempotencyKey?: string | null;
  startedAt: Date;
  finishedAt: Date;
};

export const learnExportRepo = {
  /** Composite (pack,channel,target,manifest) upsert — aynı manifest retry satır patlatmaz. */
  record(input: RecordExportInput): Promise<LearnExportAttempt> {
    return prisma.learnExportAttempt.upsert({
      where: {
        packId_channel_targetFingerprint_manifestHash: {
          packId: input.packId,
          channel: input.channel,
          targetFingerprint: input.targetFingerprint,
          manifestHash: input.manifestHash,
        },
      },
      update: {
        state: input.state,
        writtenCount: input.writtenCount,
        unchangedCount: input.unchangedCount,
        failedCount: input.failedCount,
        conflictCount: input.conflictCount,
        errorClass: input.errorClass ?? null,
        finishedAt: input.finishedAt,
      },
      create: {
        packId: input.packId,
        channel: input.channel,
        targetFingerprint: input.targetFingerprint,
        manifestHash: input.manifestHash,
        state: input.state,
        writtenCount: input.writtenCount,
        unchangedCount: input.unchangedCount,
        failedCount: input.failedCount,
        conflictCount: input.conflictCount,
        errorClass: input.errorClass ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      },
    });
  },

  findByIdempotencyKey(key: string): Promise<LearnExportAttempt | null> {
    return prisma.learnExportAttempt.findUnique({ where: { idempotencyKey: key } });
  },

  /** Pack'in tüm denemeleri (yeni→eski). UI son sonucu kanal başına buradan türetir. */
  listForPack(packId: string): Promise<LearnExportAttempt[]> {
    return prisma.learnExportAttempt.findMany({
      where: { packId },
      orderBy: { finishedAt: "desc" },
    });
  },
};
