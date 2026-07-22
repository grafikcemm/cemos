import { NextRequest, NextResponse } from "next/server";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { evalRunRepo, type EvalRunKind } from "@/lib/db/evalRunRepo";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";

export const dynamic = "force-dynamic";

/**
 * Agent değerlendirme geçmişi (ADR-034 §G/§I) — Profil > Sistem "Agent
 * değerlendirmeleri" bölümü bunu tüketir. Bounded: limit ≤ 20, kind allowlist.
 *
 * traceCoverage = son eval koşularında GÖZLENEN trace sonuçları — evrensel
 * "kayıp trace sayacı" İDDİASI DEĞİLDİR (ADR-034 dürüst sınırlama).
 */

const KINDS: EvalRunKind[] = ["registry_contract", "golden_live", "curator_live", "thread_smoke"];

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 20) : 10;
  const kindParam = url.searchParams.get("kind");
  const kind = KINDS.includes(kindParam as EvalRunKind) ? (kindParam as EvalRunKind) : undefined;

  try {
    const [recent, latestByKind, traceCoverage, registryTraces7d] = await Promise.all([
      evalRunRepo.listRecentRuns(limit, kind),
      Promise.all(KINDS.map((k) => evalRunRepo.latestRunByKind(k))),
      evalRunRepo.observedTraceCoverage(5),
      pipelineTraceRepo.countByPipelineSince("agent_registry", 7).catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      runs: recent.map((r) => ({
        id: r.id,
        kind: r.kind,
        mode: r.mode,
        trigger: r.trigger,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        passedCount: r.passedCount,
        failedCount: r.failedCount,
        skippedCount: r.skippedCount,
        totalCostUsd: r.totalCostUsd,
        policyVersion: r.policyVersion,
        errorClass: r.errorClass,
        model: r.model,
        preset: r.preset,
      })),
      latest: Object.fromEntries(
        KINDS.map((k, i) => [
          k,
          latestByKind[i]
            ? {
                id: latestByKind[i]!.id,
                status: latestByKind[i]!.status,
                mode: latestByKind[i]!.mode,
                startedAt: latestByKind[i]!.startedAt,
                passedCount: latestByKind[i]!.passedCount,
                failedCount: latestByKind[i]!.failedCount,
                skippedCount: latestByKind[i]!.skippedCount,
                totalCostUsd: latestByKind[i]!.totalCostUsd,
                errorClass: latestByKind[i]!.errorClass,
              }
            : null,
        ])
      ),
      traceCoverage,
      registryTraces7d,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.name : "eval_runs_failed" },
      { status: 500 }
    );
  }
}
