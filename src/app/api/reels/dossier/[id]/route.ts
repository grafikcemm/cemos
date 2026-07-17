import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import {
  canonicalContentOf,
  creativeReadinessOf,
  currentContentHash,
  currentEvidenceReadiness,
  editDossier,
  extractProvenance,
  findApprovalForDossier,
  type ReviewError,
} from "@/lib/reels/dossierReviewService";

/**
 * Dossier detay + edit (ADR-036 §F). ÜÇ durum AYRI döner: üretim çıktısı,
 * kanıt (evidence) tazeliği, insan onayı. Edit optimistic-concurrency'li
 * (expectedUpdatedAt); verification alanları düzenlenemez; readiness sunucuda
 * yeniden hesaplanır — istemci readiness'i kabul edilmez.
 */

type Ctx = { params: Promise<{ id: string }> };

function mapReviewError(r: ReviewError) {
  const status =
    r.code === "not_found"
      ? 404
      : r.code === "stale"
        ? 409
        : r.code === "series_version_changed"
          ? 409
          : 422; // account_mismatch | not_ready | evidence_stale
  return fail(r.message, status, { code: r.code, ...("readiness" in r ? { readiness: r.readiness } : {}) });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
  if (accountId === "") return fail("accountId gerekli", 400, { code: "account_required" });
  try {
    const d = await prisma.reelDossier.findUnique({ where: { id } });
    if (!d) return fail("Dossier bulunamadı", 404, { code: "not_found" });
    if (d.accountId !== accountId) {
      return fail("Dossier bu hesaba ait değil", 422, { code: "account_mismatch" });
    }
    const traces = await pipelineTraceRepo.listBySubject("reel_dossier", id, 5);
    const provenance = extractProvenance(traces.flatMap((t) => t.stages));
    const approval = await findApprovalForDossier(id);

    let slideCountRange: string | null = null;
    if (provenance.seriesKey) {
      const series = await prisma.seriesProfile.findFirst({
        where: { accountId, seriesKey: provenance.seriesKey, isActive: true },
        orderBy: { version: "desc" },
        select: { slideCountRange: true },
      });
      slideCountRange = series?.slideCountRange ?? null;
    }

    return ok({
      dossier: {
        id: d.id,
        accountId: d.accountId,
        title: d.title,
        format: d.format,
        pillar: d.pillar,
        objective: d.objective,
        whyNow: d.whyNow,
        painPoint: d.painPoint,
        primaryToolJson: d.primaryToolJson,
        productionEstimate: d.productionEstimate,
        risk: d.risk,
        assetChecklistJson: d.assetChecklistJson,
        costUsd: d.costUsd,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      },
      content: canonicalContentOf(d),
      contentHash: currentContentHash(d),
      // ÜÇ AYRI DURUM:
      evidence: {
        readiness: currentEvidenceReadiness(d),
        finalReadinessStored: d.finalReadiness,
        verificationId: d.verificationId,
        expiry: d.expiry?.toISOString() ?? null,
      },
      creative: creativeReadinessOf(d, { slideCountRange }),
      approval: approval
        ? { approved: true, trainingExampleId: approval.trainingExampleId }
        : { approved: false },
      provenance,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Dossier alınamadı", 500);
  }
}

const SlidePatchSchema = z.object({
  copy: z.string().min(1).max(400),
  visual: z.string().max(400).optional(),
});
const PatchSchema = z.object({
  accountId: z.string().min(1).max(64),
  expectedUpdatedAt: z.string().min(10).max(40),
  carousel: z
    .object({
      cover: z.string().min(1).max(400).optional(),
      slides: z.array(SlidePatchSchema).min(1).max(12).optional(),
      caption: z.string().min(1).max(2200).optional(),
      hashtags: z.array(z.string().min(2).max(60)).max(30).optional(),
    })
    .optional(),
  reels: z
    .object({
      hook: z.string().min(1).max(160).optional(),
      script: z.string().min(1).max(6000).optional(),
      voiceover: z.string().min(1).max(6000).optional(),
      cover: z.string().min(1).max(400).optional(),
      cta: z.string().min(1).max(300).optional(),
      caption: z.string().min(1).max(2200).optional(),
      hashtags: z.array(z.string().min(2).max(60)).max(30).optional(),
      onScreenCopy: z.array(z.string().max(160)).max(40).optional(),
    })
    .optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PatchSchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek alanları", 400);
  try {
    const r = await editDossier({ dossierId: id, ...parsed.data });
    if (!r.ok) return mapReviewError(r);
    return ok({ ...r });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Düzenleme başarısız", 500);
  }
}
