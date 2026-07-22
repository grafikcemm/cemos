/**
 * Alternatif araç zinciri işlemleri (ADR-038 §E) — account-scoped,
 * concurrency-safe, non-destructive.
 *
 *  - add: en fazla MAX_ALTERNATIVES aktif alternatif; duplicate URL reddedilir;
 *    yeni alternatif DOĞRULANMAMIŞ başlar (manuel "verified" işareti yok).
 *  - archive: status="archived" + archivedAt — fiziksel DELETE YOK; idempotent.
 *  - verify: dossierProductionService.reverifyDossier({kind:"alternative"})
 *    üzerinden — her alternatif KENDİ WebsiteVerification satırını alır.
 *  - promotion YOK: alternatif primary'yi sessizce değiştiremez; güvenli yol
 *    alternatifi YENİ dossier üretimine prefill etmektir (ADR-036 kapılı).
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { acquireXactAdvisoryLock } from "@/lib/db/advisoryLock";
import {
  parseAlternatives,
  serializeAlternatives,
  activeAlternatives,
  MAX_ALTERNATIVES,
  type DossierAlternative,
} from "@/lib/reels/alternatives";

export type AlternativeOpError = {
  ok: false;
  code:
    | "not_found"
    | "account_mismatch"
    | "stale"
    | "max_alternatives"
    | "duplicate_url"
    | "alternative_not_found";
  message: string;
};

export type AlternativeOpResult =
  | AlternativeOpError
  | {
      ok: true;
      updatedAt: string;
      alternatives: DossierAlternative[];
      alreadyArchived?: boolean;
    };

type LockedOp = (fresh: {
  alternatives: DossierAlternative[];
}) =>
  | { ok: true; next: DossierAlternative[]; alreadyArchived?: boolean }
  | AlternativeOpError;

async function withLockedAlternatives(input: {
  dossierId: string;
  accountId: string;
  expectedUpdatedAt: string;
  op: LockedOp;
}): Promise<AlternativeOpResult> {
  const expected = Date.parse(input.expectedUpdatedAt);
  if (!Number.isFinite(expected)) {
    return { ok: false, code: "stale", message: "expectedUpdatedAt geçersiz." };
  }
  return prisma.$transaction(async (tx) => {
    await acquireXactAdvisoryLock(tx, "reel_alt:" + input.dossierId);
    const d = await tx.reelDossier.findUnique({ where: { id: input.dossierId } });
    if (!d) return { ok: false as const, code: "not_found" as const, message: "Dossier bulunamadı." };
    if (d.accountId !== input.accountId) {
      return {
        ok: false as const,
        code: "account_mismatch" as const,
        message: "Dossier bu hesaba ait değil.",
      };
    }
    if (d.updatedAt.getTime() !== expected) {
      return {
        ok: false as const,
        code: "stale" as const,
        message: "Dossier bu arada değişti — sayfayı yenileyip tekrar dene.",
      };
    }
    const { alternatives } = parseAlternatives(d.alternativesJson);
    const r = input.op({ alternatives });
    if (!r.ok) return r;
    const updated = await tx.reelDossier.update({
      where: { id: d.id },
      data: { alternativesJson: serializeAlternatives(r.next) },
    });
    return {
      ok: true as const,
      updatedAt: updated.updatedAt.toISOString(),
      alternatives: r.next,
      ...(r.alreadyArchived !== undefined ? { alreadyArchived: r.alreadyArchived } : {}),
    };
  });
}

export async function addAlternative(input: {
  dossierId: string;
  accountId: string;
  expectedUpdatedAt: string;
  name: string;
  submittedUrl: string;
  nowMs?: number;
}): Promise<AlternativeOpResult> {
  return withLockedAlternatives({
    ...input,
    op: ({ alternatives }) => {
      const active = activeAlternatives(alternatives);
      if (active.length >= MAX_ALTERNATIVES) {
        return {
          ok: false,
          code: "max_alternatives",
          message: `En fazla ${MAX_ALTERNATIVES} aktif alternatif eklenebilir.`,
        };
      }
      if (active.some((a) => a.submittedUrl === input.submittedUrl)) {
        return {
          ok: false,
          code: "duplicate_url",
          message: "Bu URL zaten aktif bir alternatifte kayıtlı.",
        };
      }
      const now = new Date(input.nowMs ?? Date.now()).toISOString();
      const fresh: DossierAlternative = {
        id: randomUUID(),
        name: input.name,
        submittedUrl: input.submittedUrl,
        finalUrl: null,
        verificationId: null,
        opens: null,
        checkedAt: null,
        expiry: null,
        status: "active",
        archivedAt: null,
        createdAt: now,
      };
      return { ok: true, next: [...alternatives, fresh] };
    },
  });
}

export async function archiveAlternative(input: {
  dossierId: string;
  accountId: string;
  expectedUpdatedAt: string;
  alternativeId: string;
  nowMs?: number;
}): Promise<AlternativeOpResult> {
  return withLockedAlternatives({
    ...input,
    op: ({ alternatives }) => {
      const target = alternatives.find((a) => a.id === input.alternativeId);
      if (!target) {
        return {
          ok: false,
          code: "alternative_not_found",
          message: "Alternatif bulunamadı.",
        };
      }
      if (target.status === "archived") {
        // İdempotent: tekrar arşivleme no-op.
        return { ok: true, next: alternatives, alreadyArchived: true };
      }
      const now = new Date(input.nowMs ?? Date.now()).toISOString();
      const next = alternatives.map((a) =>
        a.id === input.alternativeId
          ? { ...a, status: "archived" as const, archivedAt: now }
          : a
      );
      return { ok: true, next, alreadyArchived: false };
    },
  });
}
