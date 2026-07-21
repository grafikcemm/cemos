/**
 * Dossier production-state assembly + re-verification lifecycle (ADR-038 §C/§D).
 *
 * Sözleşmeler:
 *  - Production state HER OKUMADA gerçek WebsiteVerification satırı, güncel
 *    içerik, onay, provenance ve slot ilişkisi üzerinden TÜRETİLİR; stored
 *    `finalReadiness` yalnız snapshot/audit değeridir.
 *  - Re-verify LLM ÇAĞIRMAZ ve Instagram generation approval GEREKTİRMEZ —
 *    yalnız Tier-1 HTTP doğrulamasıdır. URL her zaman dossier'in server-side
 *    verisinden alınır; istemci keyfi fetch URL'si VEREMEZ (fetch-proxy yasak).
 *  - Ağ doğrulaması transaction DIŞINDA; DB güncellemesi advisory-lock'lu KISA
 *    transaction içinde. Yarışan iki verify'dan geç kalan, bu arada değişmiş
 *    dossier'ı EZEMEZ (in-tx expectedUpdatedAt yeniden kontrolü → stale).
 *  - Başarısız re-verify eski kanıtı SİLMEZ, bayat kanıtı "taze" YAPMAZ;
 *    deneme izi bounded/redacted olarak PipelineTrace'e yazılır (typed kod,
 *    ham hata/iç host yok).
 */

import type { ReelDossier } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { acquireXactAdvisoryLock } from "@/lib/db/advisoryLock";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import {
  verifyWebsiteWithReuse,
  type VerifyWebsiteResult,
  type VerifyFailureCode,
} from "@/lib/verify/verifyWebsite";
import { computeReadiness } from "@/lib/reels/dossier-generator";
import {
  creativeReadinessOf,
  extractProvenance,
  findApprovalForDossier,
} from "@/lib/reels/dossierReviewService";
import {
  parseAlternatives,
  serializeAlternatives,
  activeAlternatives,
} from "@/lib/reels/alternatives";
import {
  computeDossierProductionState,
  type DossierProductionState,
  type SeriesContractState,
  type AttachedSlotInput,
} from "@/lib/reels/productionState";

export const REVERIFY_PIPELINE_ID = "reel_dossier_reverify";

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function primaryToolOf(d: ReelDossier): { name: string; url: string } | null {
  const t = safeParse<{ name?: string; url?: string }>(d.primaryToolJson, {});
  return t.name && t.url ? { name: t.name, url: t.url } : null;
}

/** Seri sözleşmesi durumu — approve'daki kontrolle AYNI kural (promptVersion). */
async function seriesContractOf(d: ReelDossier): Promise<{
  state: SeriesContractState;
  slideCountRange: string | null;
}> {
  const traces = await pipelineTraceRepo.listBySubject("reel_dossier", d.id, 5);
  const provenance = extractProvenance(traces.flatMap((t) => t.stages));
  if (!provenance.seriesKey) return { state: "none", slideCountRange: null };
  const series = await prisma.seriesProfile.findFirst({
    where: { accountId: d.accountId, seriesKey: provenance.seriesKey, isActive: true },
    orderBy: { version: "desc" },
    select: { promptVersion: true, slideCountRange: true },
  });
  if (!series || series.promptVersion !== provenance.promptVersion) {
    return { state: "changed", slideCountRange: series?.slideCountRange ?? null };
  }
  return { state: "valid", slideCountRange: series.slideCountRange ?? null };
}

async function attachedSlotsOf(dossierId: string): Promise<AttachedSlotInput[]> {
  const slots = await prisma.reelPlanSlot.findMany({
    where: { dossierId },
    include: { plan: { select: { month: true } } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  return slots.map((s) => ({
    slotId: s.id,
    month: s.plan.month,
    dayOfMonth: s.dayOfMonth,
    status: s.status,
  }));
}

/**
 * Güncel production state — tek kaynak. UI ve API bunun çıktısını kullanır;
 * istemciden gelen verificationId/evidence/finalReadiness'a ASLA güvenilmez.
 */
export async function getDossierProductionState(
  d: ReelDossier,
  nowMs = Date.now()
): Promise<DossierProductionState> {
  const tool = primaryToolOf(d);
  const [verificationRow, seriesInfo, approval, attachedSlots] = await Promise.all([
    d.verificationId
      ? prisma.websiteVerification.findUnique({ where: { id: d.verificationId } })
      : Promise.resolve(null),
    seriesContractOf(d),
    findApprovalForDossier(d.id),
    attachedSlotsOf(d.id),
  ]);
  const { alternatives, parseFailed } = parseAlternatives(d.alternativesJson);
  const creative = creativeReadinessOf(d, {
    slideCountRange: seriesInfo.slideCountRange,
    nowMs,
  });
  return computeDossierProductionState({
    toolNamed: tool !== null,
    primaryToolUrl: tool?.url ?? null,
    verificationId: d.verificationId,
    verificationRow,
    alternatives,
    alternativesParseFailed: parseFailed,
    creative,
    approved: approval !== null,
    trainingExampleId: approval?.trainingExampleId ?? null,
    seriesContract: seriesInfo.state,
    attachedSlots,
    nowMs,
  });
}

// ── Re-verification lifecycle ────────────────────────────────────────────────

export type ReverifyTarget = { kind: "primary" } | { kind: "alternative"; alternativeId: string };

export type ReverifyError = {
  ok: false;
  code: "not_found" | "account_mismatch" | "stale" | "no_tool" | "alternative_not_found";
  message: string;
};

export type ReverifyResult =
  | ReverifyError
  | {
      ok: true;
      outcome: {
        status: "verified" | "verification_failed";
        /** verification_failed iken typed kod (ham hata asla). */
        code: VerifyFailureCode | null;
        reused: boolean;
        verificationId: string | null;
        opens: boolean | null;
      };
      updatedAt: string;
      production: DossierProductionState;
    };

export type VerifyImpl = (
  url: string,
  opts: { forceRefresh?: boolean }
) => Promise<VerifyWebsiteResult>;

export async function reverifyDossier(input: {
  dossierId: string;
  accountId: string;
  expectedUpdatedAt: string;
  target?: ReverifyTarget;
  /** Açık kullanıcı eylemi varsayılanı force-refresh'tir (cache reuse ayrı). */
  forceRefresh?: boolean;
  verifyImpl?: VerifyImpl;
  nowMs?: number;
}): Promise<ReverifyResult> {
  const target: ReverifyTarget = input.target ?? { kind: "primary" };
  const forceRefresh = input.forceRefresh ?? true;
  const verifyImpl: VerifyImpl =
    input.verifyImpl ?? ((url, opts) => verifyWebsiteWithReuse(url, opts));

  const d = await prisma.reelDossier.findUnique({ where: { id: input.dossierId } });
  if (!d) return { ok: false, code: "not_found", message: "Dossier bulunamadı." };
  if (d.accountId !== input.accountId) {
    return { ok: false, code: "account_mismatch", message: "Dossier bu hesaba ait değil." };
  }
  const expected = Date.parse(input.expectedUpdatedAt);
  if (!Number.isFinite(expected) || expected !== d.updatedAt.getTime()) {
    return {
      ok: false,
      code: "stale",
      message: "Dossier bu arada değişti — sayfayı yenileyip tekrar dene.",
    };
  }

  // URL SERVER-SIDE çözülür — istemciden URL kabul edilmez.
  let url: string;
  if (target.kind === "primary") {
    const tool = primaryToolOf(d);
    if (!tool) {
      return {
        ok: false,
        code: "no_tool",
        message: "Bu dossier'de adlandırılmış araç yok — doğrulanacak URL yok.",
      };
    }
    url = tool.url;
  } else {
    const { alternatives } = parseAlternatives(d.alternativesJson);
    const alt = activeAlternatives(alternatives).find((a) => a.id === target.alternativeId);
    if (!alt) {
      return {
        ok: false,
        code: "alternative_not_found",
        message: "Aktif alternatif bulunamadı.",
      };
    }
    url = alt.submittedUrl;
  }

  // ── Ağ doğrulaması: transaction DIŞINDA (uzun HTTP, kısa DB) ──
  const v = await verifyImpl(url, { forceRefresh });

  // ── Kısa transaction: advisory lock + in-tx concurrency yeniden kontrolü ──
  const txResult = await prisma.$transaction(async (tx) => {
    await acquireXactAdvisoryLock(tx, "reel_verify:" + d.id);
    const fresh = await tx.reelDossier.findUnique({ where: { id: d.id } });
    if (!fresh) return { applied: false as const, reason: "not_found" as const };
    if (fresh.updatedAt.getTime() !== expected) {
      // Yarışı kaybeden sonuç yeni durumu EZEMEZ.
      return { applied: false as const, reason: "stale" as const };
    }
    if (!v.ok) {
      // Başarısız deneme: eski kanıt/audit AYNEN korunur, hiçbir alan yazılmaz.
      return { applied: true as const, updatedAt: fresh.updatedAt };
    }
    if (target.kind === "primary") {
      const updated = await tx.reelDossier.update({
        where: { id: d.id },
        data: {
          verificationId: v.verificationId ?? null,
          verificationEvidenceJson: JSON.stringify(v.evidence),
          expiry: new Date(v.evidence.expiry),
          finalReadiness: computeReadiness({
            toolNamed: true,
            evidence: v.evidence,
            verificationId: v.verificationId ?? null,
            nowMs: input.nowMs,
          }),
        },
      });
      return { applied: true as const, updatedAt: updated.updatedAt };
    }
    // Alternative hedefi: yalnız ilgili zarf girdisi güncellenir; primary
    // kanıt alanlarına DOKUNULMAZ (kanıt kopyalama yasağı).
    const { alternatives } = parseAlternatives(fresh.alternativesJson);
    const next = alternatives.map((a) =>
      a.id === target.alternativeId
        ? {
            ...a,
            verificationId: v.verificationId ?? null,
            finalUrl: v.evidence.finalUrl,
            opens: v.evidence.opens,
            checkedAt: new Date(v.evidence.checkedAt).toISOString(),
            expiry: new Date(v.evidence.expiry).toISOString(),
          }
        : a
    );
    const updated = await tx.reelDossier.update({
      where: { id: d.id },
      data: { alternativesJson: serializeAlternatives(next) },
    });
    return { applied: true as const, updatedAt: updated.updatedAt };
  });

  if (!txResult.applied) {
    return {
      ok: false,
      code: txResult.reason === "not_found" ? "not_found" : "stale",
      message:
        txResult.reason === "not_found"
          ? "Dossier bulunamadı."
          : "Dossier bu arada değişti — sonuç uygulanmadı; sayfayı yenile.",
    };
  }

  // ── Bounded/redacted deneme izi (başarı + başarısızlık) — best-effort ──
  try {
    await pipelineTraceRepo.create({
      platform: "instagram",
      pipelineId: REVERIFY_PIPELINE_ID,
      subjectType: "reel_dossier",
      subjectId: d.id,
      stages: [
        {
          stage: "reverify",
          role: "none",
          model: "",
          ok: v.ok,
          failOpenUsed: false,
          ms: 0,
          costUsd: 0,
          outcome: v.ok ? "verified" : "verification_failed",
          blockedReason: v.ok ? undefined : v.code,
          policyVersion: "3D-1",
          accountId: d.accountId,
          outputSchemaVersion: target.kind, // hedef türü (primary|alternative)
        },
      ],
      totalCostUsd: 0,
    });
  } catch {
    /* iz best-effort — doğrulama sonucunu bozmaz */
  }

  const reloaded = await prisma.reelDossier.findUnique({ where: { id: d.id } });
  const finalDossier = reloaded ?? d;
  const production = await getDossierProductionState(finalDossier, input.nowMs);

  return {
    ok: true,
    outcome: v.ok
      ? {
          status: "verified",
          code: null,
          reused: Boolean(v.reused),
          verificationId: v.verificationId ?? null,
          opens: v.evidence.opens,
        }
      : {
          status: "verification_failed",
          code: v.code,
          reused: false,
          verificationId: null,
          opens: null,
        },
    updatedAt: finalDossier.updatedAt.toISOString(),
    production,
  };
}
