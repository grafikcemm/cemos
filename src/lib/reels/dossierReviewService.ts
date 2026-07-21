import { prisma } from "@/lib/db/client";
import { acquireXactAdvisoryLock } from "@/lib/db/advisoryLock";
import type { ReelDossier } from "@/generated/prisma/client";
import { pipelineTraceRepo, type PipelineTraceStage } from "@/lib/db/pipelineTraceRepo";
import { computeReadiness, reelsContentHash } from "@/lib/reels/dossier-generator";
import { carouselContentHash, normalizeHashtags, type CarouselOutput } from "@/lib/series/carouselGenerator";
import {
  computeCarouselCreativeReadiness,
  computeReelsCreativeReadiness,
  type CreativeReadiness,
  type EvidenceReadiness,
} from "@/lib/reels/creativeReadiness";
import type { VerificationEvidence } from "@/lib/verify/verifyWebsite";

/**
 * Dossier review/approve servisi (ADR-036 §F/§G).
 *
 * Sözleşmeler:
 *  - Optimistic concurrency: `expectedUpdatedAt` (ISO) satırın updatedAt'ıyla
 *    ms-eşit olmalı; değilse "stale" (route 409).
 *  - Operatör edit'i verification/evidence alanlarını DEĞİŞTİREMEZ (şema dışı).
 *  - Server canonical JSON üretir (slaytlar yeniden numaralanır, hashtag'ler
 *    normalize edilir); readiness her edit sonrası SUNUCUDA yeniden hesaplanır.
 *  - Onay: yalnız creative ready_for_review + evidence taze + (varsa) seri
 *    promptVersion değişmemişken; Postgres advisory-lock transaction'ı ile
 *    idempotent — aynı dossier için İKİNCİ TrainingExample imkânsız
 *    (concurrent çift onay dahil). Onaylanmışlık durumu TÜRETİLİR:
 *    TrainingExample.metricsJson `"dossierId":"<id>"` içerir (kolon yok —
 *    rotation doğrulanmadan migration yasak, ADR-036).
 *  - pastTopicsJson append'i DNA sözleşme değişikliği DEĞİLDİR → seri version
 *    bump edilmez (anti-repetition hafızası).
 */

export const APPROVAL_SCHEMA_VERSION = "3B-1";
const PAST_TOPICS_CAP = 100;

// ── Parse yardımcıları ───────────────────────────────────────────────────────
function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export type DossierProvenance = {
  seriesKey: string | null;
  seriesVersion: number | null;
  promptVersion: string | null;
  sourceHandoffId: string | null;
  contentHash: string | null;
  model: string | null;
  policyVersion: string | null;
};

export function extractProvenance(stages: PipelineTraceStage[]): DossierProvenance {
  const prov = stages.find((s) => s.stage === "provenance");
  const firstLlm = stages.find((s) => s.model && s.model !== "");
  return {
    seriesKey: prov?.seriesKey ?? null,
    seriesVersion: prov?.seriesVersion ?? null,
    promptVersion: prov?.promptVersion ?? null,
    sourceHandoffId: prov?.sourceHandoffId ?? null,
    contentHash: prov?.contentHash ?? null,
    model: firstLlm?.model ?? null,
    policyVersion: prov?.policyVersion ?? null,
  };
}

function toolNamedOf(d: ReelDossier): boolean {
  const t = safeParse<{ name?: string; url?: string }>(d.primaryToolJson, {});
  return Boolean(t.name && t.url);
}

function evidenceOf(d: ReelDossier): VerificationEvidence | null {
  const e = safeParse<Record<string, unknown>>(d.verificationEvidenceJson, {});
  return typeof e.opens === "boolean" ? (e as unknown as VerificationEvidence) : null;
}

/** Kanıt tazeliği HER OKUMADA yeniden hesaplanır (stored değer bayatlayabilir). */
export function currentEvidenceReadiness(d: ReelDossier, nowMs?: number): EvidenceReadiness {
  return computeReadiness({
    toolNamed: toolNamedOf(d),
    evidence: evidenceOf(d),
    verificationId: d.verificationId,
    nowMs,
  });
}

export type CanonicalCarousel = {
  format: "carousel";
  cover: string;
  slides: Array<{ n: number; copy: string; visual: string }>;
  caption: string;
  hashtags: string[];
};
export type CanonicalReels = {
  format: "reel";
  hook: string;
  script: string;
  timeline: unknown[];
  scenePlan: unknown[];
  screenRecordingPlan: unknown[];
  voiceover: string;
  onScreenCopy: string[];
  cover: string;
  cta: string;
  caption: string;
  hashtags: string[];
};
export type CanonicalContent = CanonicalCarousel | CanonicalReels;

export function canonicalContentOf(d: ReelDossier): CanonicalContent {
  const hashtags = safeParse<string[]>(d.hashtagGroupJson, []);
  if (d.format === "carousel") {
    return {
      format: "carousel",
      cover: d.cover,
      slides: safeParse<Array<{ n: number; copy: string; visual?: string }>>(d.slidesJson, []).map(
        (s, i) => ({ n: i + 1, copy: String(s.copy ?? ""), visual: String(s.visual ?? "") })
      ),
      caption: d.caption,
      hashtags,
    };
  }
  return {
    format: "reel",
    hook: d.hook,
    script: d.script,
    timeline: safeParse<unknown[]>(d.timelineJson, []),
    scenePlan: safeParse<unknown[]>(d.scenePlanJson, []),
    screenRecordingPlan: safeParse<unknown[]>(d.screenRecordingPlanJson, []),
    voiceover: d.voiceover,
    onScreenCopy: safeParse<string[]>(d.onScreenCopyJson, []),
    cover: d.cover,
    cta: d.cta,
    caption: d.caption,
    hashtags,
  };
}

export function currentContentHash(d: ReelDossier): string {
  const c = canonicalContentOf(d);
  if (c.format === "carousel") {
    const out: CarouselOutput = {
      cover: c.cover,
      slides: c.slides,
      caption: c.caption,
      hashtags: c.hashtags,
    };
    return carouselContentHash(out);
  }
  return reelsContentHash({
    hook: c.hook,
    script: c.script,
    voiceover: c.voiceover,
    cover: c.cover,
    cta: c.cta,
    caption: c.caption,
    hashtags: c.hashtags,
    timeline: c.timeline,
    scenePlan: c.scenePlan,
    screenRecordingPlan: c.screenRecordingPlan,
    onScreenCopy: c.onScreenCopy,
  });
}

export function creativeReadinessOf(
  d: ReelDossier,
  opts?: { slideCountRange?: string | null; nowMs?: number }
): CreativeReadiness {
  const evidence = currentEvidenceReadiness(d, opts?.nowMs);
  const toolNamed = toolNamedOf(d);
  const c = canonicalContentOf(d);
  if (c.format === "carousel") {
    return computeCarouselCreativeReadiness({
      cover: c.cover,
      slides: c.slides,
      caption: c.caption,
      hashtags: c.hashtags,
      slideCountRange: opts?.slideCountRange ?? null,
      toolNamed,
      evidenceReadiness: evidence,
    });
  }
  return computeReelsCreativeReadiness({
    hook: c.hook,
    script: c.script,
    timeline: c.timeline,
    scenePlan: c.scenePlan,
    screenRecordingPlan: c.screenRecordingPlan,
    voiceover: c.voiceover,
    cover: c.cover,
    cta: c.cta,
    caption: c.caption,
    hashtags: c.hashtags,
    toolNamed,
    evidenceReadiness: evidence,
  });
}

// ── Approval durumu (türetilmiş — kolon yok) ────────────────────────────────
export async function findApprovalForDossier(
  dossierId: string
): Promise<{ trainingExampleId: string } | null> {
  const row = await prisma.trainingExample.findFirst({
    where: { metricsJson: { contains: `"dossierId":"${dossierId}"` } },
    select: { id: true },
  });
  return row ? { trainingExampleId: row.id } : null;
}

// ── Ortak yükleme + sahiplik ────────────────────────────────────────────────
export type ReviewError =
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "account_mismatch"; message: string }
  | { ok: false; code: "stale"; message: string }
  | { ok: false; code: "not_ready"; message: string; readiness: CreativeReadiness }
  | { ok: false; code: "evidence_stale"; message: string }
  | { ok: false; code: "series_version_changed"; message: string };

async function loadOwned(
  dossierId: string,
  accountId: string,
  expectedUpdatedAt: string
): Promise<{ ok: true; dossier: ReelDossier } | ReviewError> {
  const d = await prisma.reelDossier.findUnique({ where: { id: dossierId } });
  if (!d) return { ok: false, code: "not_found", message: "Dossier bulunamadı." };
  if (d.accountId !== accountId) {
    return { ok: false, code: "account_mismatch", message: "Dossier bu hesaba ait değil." };
  }
  const expected = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expected) || expected !== d.updatedAt.getTime()) {
    return {
      ok: false,
      code: "stale",
      message: "Dossier bu arada değişti — sayfayı yenileyip tekrar dene.",
    };
  }
  return { ok: true, dossier: d };
}

// ── EDIT ─────────────────────────────────────────────────────────────────────
export type CarouselEditPatch = {
  cover?: string;
  slides?: Array<{ copy: string; visual?: string }>;
  caption?: string;
  hashtags?: string[];
};
export type ReelsEditPatch = {
  hook?: string;
  script?: string;
  voiceover?: string;
  cover?: string;
  cta?: string;
  caption?: string;
  hashtags?: string[];
  onScreenCopy?: string[];
};

export type EditResult =
  | {
      ok: true;
      dossierId: string;
      updatedAt: string;
      contentHash: string;
      readiness: CreativeReadiness;
    }
  | ReviewError;

export async function editDossier(input: {
  dossierId: string;
  accountId: string;
  expectedUpdatedAt: string;
  carousel?: CarouselEditPatch;
  reels?: ReelsEditPatch;
}): Promise<EditResult> {
  const loaded = await loadOwned(input.dossierId, input.accountId, input.expectedUpdatedAt);
  if (!loaded.ok) return loaded;
  const d = loaded.dossier;

  const data: Record<string, unknown> = {};
  if (d.format === "carousel" && input.carousel) {
    const p = input.carousel;
    if (p.cover !== undefined) data.cover = p.cover;
    if (p.caption !== undefined) data.caption = p.caption;
    if (p.slides !== undefined) {
      // Server canonical: sıra = dizi sırası, numaralar yeniden atanır.
      data.slidesJson = JSON.stringify(
        p.slides.map((s, i) => ({ n: i + 1, copy: s.copy, visual: s.visual ?? "" }))
      );
    }
    if (p.hashtags !== undefined) {
      data.hashtagGroupJson = JSON.stringify(normalizeHashtags(p.hashtags));
    }
  } else if (d.format !== "carousel" && input.reels) {
    const p = input.reels;
    for (const key of ["hook", "script", "voiceover", "cover", "cta", "caption"] as const) {
      if (p[key] !== undefined) data[key] = p[key];
    }
    if (p.hashtags !== undefined) {
      data.hashtagGroupJson = JSON.stringify(normalizeHashtags(p.hashtags));
    }
    if (p.onScreenCopy !== undefined) {
      data.onScreenCopyJson = JSON.stringify(p.onScreenCopy.filter((s) => s.trim() !== ""));
    }
  }
  // Verification/evidence alanları BİLİNÇLİ olarak yazılabilir değil.

  const updated =
    Object.keys(data).length === 0
      ? d
      : await prisma.reelDossier.update({ where: { id: d.id }, data });

  return {
    ok: true,
    dossierId: updated.id,
    updatedAt: updated.updatedAt.toISOString(),
    contentHash: currentContentHash(updated),
    readiness: creativeReadinessOf(updated),
  };
}

// ── APPROVE ──────────────────────────────────────────────────────────────────
export type ApproveResult =
  | {
      ok: true;
      trainingExampleId: string;
      alreadyApproved: boolean;
      operatorEdited: boolean;
    }
  | ReviewError;

export async function approveDossier(input: {
  dossierId: string;
  accountId: string;
  expectedUpdatedAt: string;
}): Promise<ApproveResult> {
  const loaded = await loadOwned(input.dossierId, input.accountId, input.expectedUpdatedAt);
  if (!loaded.ok) return loaded;
  const d = loaded.dossier;

  // Provenance (trace) — seri sözleşme kontrolü + operatör-edit tespiti.
  const traces = await pipelineTraceRepo.listBySubject("reel_dossier", d.id, 5);
  const provenance = extractProvenance(traces.flatMap((t) => t.stages));

  // Kanıt tazeliği onay ANINDA yeniden hesaplanır.
  const evidence = currentEvidenceReadiness(d);
  if (toolNamedOf(d) && evidence !== "ready") {
    return {
      ok: false,
      code: "evidence_stale",
      message:
        evidence === "needs_verify"
          ? "Araç kanıtının süresi geçmiş — onaydan önce yeniden doğrula."
          : "Araç kanıtı yok/açılmıyor — onaylanamaz.",
    };
  }

  // Seri promptVersion onay anında yeniden kontrol edilir.
  let seriesId: string | null = null;
  let seriesPastTopics: string[] = [];
  if (provenance.seriesKey) {
    const series = await prisma.seriesProfile.findFirst({
      where: { accountId: d.accountId, seriesKey: provenance.seriesKey, isActive: true },
      orderBy: { version: "desc" },
      select: { id: true, promptVersion: true, pastTopicsJson: true },
    });
    if (!series || series.promptVersion !== provenance.promptVersion) {
      return {
        ok: false,
        code: "series_version_changed",
        message:
          "Seri sözleşmesi üretimden sonra değişti — bu dossier güncel sözleşmeyle onaylanamaz; yeniden üret.",
      };
    }
    seriesId = series.id;
    seriesPastTopics = safeParse<string[]>(series.pastTopicsJson, []);
  }

  // Creative readiness onay anında sunucuda hesaplanır (istemci değeri asla).
  const readiness = creativeReadinessOf(d);
  if (readiness.status !== "ready_for_review") {
    return {
      ok: false,
      code: "not_ready",
      message: "İçerik editoryal olarak onaya hazır değil.",
      readiness,
    };
  }

  const canonical = canonicalContentOf(d);
  const hashNow = currentContentHash(d);
  const operatorEdited = Boolean(provenance.contentHash && provenance.contentHash !== hashNow);

  // ── Advisory-lock'lu idempotent onay (concurrent çift onayda tek kayıt) ──
  const result = await prisma.$transaction(async (tx) => {
    await acquireXactAdvisoryLock(tx, d.id);
    const existing = await tx.trainingExample.findFirst({
      where: { metricsJson: { contains: `"dossierId":"${d.id}"` } },
      select: { id: true },
    });
    if (existing) {
      return { trainingExampleId: existing.id, alreadyApproved: true };
    }
    const te = await tx.trainingExample.create({
      data: {
        accountId: d.accountId,
        inputType: "ig_dossier_approval",
        sourceContent: `topic: ${d.title}`,
        outputContent: JSON.stringify(canonical),
        label: operatorEdited ? "edited" : "positive",
        reason: "",
        metricsJson: JSON.stringify({
          schemaVersion: APPROVAL_SCHEMA_VERSION,
          dossierId: d.id,
          format: canonical.format,
          seriesKey: provenance.seriesKey,
          seriesVersion: provenance.seriesVersion,
          promptVersion: provenance.promptVersion,
          model: provenance.model,
          operatorEdited,
        }),
        platform: "instagram",
        seriesKey: provenance.seriesKey,
      },
    });
    // Seri anti-repetition hafızası (version bump YOK — DNA sözleşmesi değişmedi).
    if (seriesId) {
      const topic = d.title.trim();
      if (topic !== "" && !seriesPastTopics.includes(topic)) {
        const next = [...seriesPastTopics, topic].slice(-PAST_TOPICS_CAP);
        await tx.seriesProfile.update({
          where: { id: seriesId },
          data: { pastTopicsJson: JSON.stringify(next) },
        });
      }
    }
    return { trainingExampleId: te.id, alreadyApproved: false };
  });

  // ── Best-effort yan etkiler (approval transaction'ını ASLA bozmaz) ──
  if (!result.alreadyApproved) {
    if (operatorEdited) {
      try {
        await prisma.feedbackEvent.create({
          data: {
            accountId: d.accountId,
            feedbackType: "edited",
            originalContent: null,
            editedContent: JSON.stringify(canonical).slice(0, 20_000),
            reason: JSON.stringify({
              source: "ig_dossier_approval",
              dossierId: d.id,
              originalContentHash: provenance.contentHash,
              approvedContentHash: hashNow,
            }),
            editDistance: null, // orijinal metin saklanmıyor (yalnız hash) — dürüst null
            platform: "instagram",
          },
        });
      } catch {
        /* edit sinyali best-effort */
      }
    }
    try {
      const { embedTrainingExample } = await import("@/lib/growth-engine/vector-memory");
      await embedTrainingExample(result.trainingExampleId);
    } catch {
      /* embedding fail-open */
    }
  }

  return { ok: true, ...result, operatorEdited };
}
