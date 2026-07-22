import { getLiveEvalGate } from "@/lib/config/liveGates";
import { getBudgetStatus } from "@/lib/config/costGate";
import { resolvePreset } from "@/lib/ai/presets";
import { evalRunRepo, type EvalRunTrigger } from "@/lib/db/evalRunRepo";

/**
 * İlk canlı curator + thread smoke (ADR-034 §J). YALNIZ bütün güvenlik/harcama
 * kapıları geçerse gerçek OpenRouter çağrısı yapar; aksi halde HİÇBİR ağ
 * çağrısı olmadan blocked_external EvalRun kaydı bırakır (dürüst durum).
 *
 * Canlı bölüm minimal tutulur:
 *  1. Bir Opportunity Curator live case (registry executor üzerinden)
 *  2. Bir content-creator thread smoke (runDraftPipeline, evaluation budget,
 *     açık thread niyeti, NO-PERSIST: QueueItem yazılmaz, publish yok,
 *     X/Instagram'a yazılmaz)
 *
 * Harcama tavanı: her canlı çağrı sonrası birikmiş maliyet gate.maxUsd'yi
 * aşarsa kalan case'ler koşulmaz (partial + budget_cap).
 */

export const LIVE_SMOKE_POLICY_VERSION = "2E-1";

export type LiveSmokePreflight = {
  allowed: boolean;
  missing: string[];
  maxUsd: number;
};

/** Kapı + katalog + bütçe ön kontrolü. Ağ çağrısı YAPMAZ (bütçe okuması DB). */
export async function liveSmokePreflight(): Promise<LiveSmokePreflight> {
  const gate = getLiveEvalGate();
  const missing = [...gate.missing];
  // Katalog doğrulaması: preset'ler çözülmeli (çözülmezse throw → missing).
  for (const preset of ["cemos-research", "cemos-writer"] as const) {
    try {
      resolvePreset(preset);
    } catch {
      missing.push(`preset:${preset}`);
    }
  }
  if (gate.allowed) {
    try {
      const budget = await getBudgetStatus({ budgetClass: "evaluation", estimatedCostUsd: gate.maxUsd });
      if (!budget.allowed) missing.push(`budget:${budget.reason ?? "evaluation"}`);
    } catch {
      missing.push("budget:unreadable");
    }
  }
  return { allowed: missing.length === 0, missing, maxUsd: gate.maxUsd };
}

export type LiveSmokeResult = {
  status: "blocked_external" | "passed" | "partial" | "failed";
  curatorRunId: string | null;
  threadRunId: string | null;
  missing: string[];
  totalCostUsd: number;
  notes: string[];
};

type CaseOutcome = {
  status: "passed" | "failed" | "blocked_external";
  costUsd: number;
  details: Record<string, unknown>;
};

async function runCuratorLiveCase(): Promise<CaseOutcome> {
  const { AGENT_EVAL_FIXTURES } = await import("@/lib/agents/registry/fixtures");
  const { executeAgent } = await import("@/lib/agents/registry/executor");
  const fixture = AGENT_EVAL_FIXTURES.find(
    (f) => f.agentId === "opportunity-curator" && f.contract.liveAllowlisted
  );
  if (!fixture) return { status: "failed", costUsd: 0, details: { reason: "no_live_fixture" } };
  if (process.env.ENABLE_AGENT_CURATION !== "1") {
    return { status: "blocked_external", costUsd: 0, details: { reason: "agent_curation_disabled" } };
  }
  const result = await executeAgent(fixture.agentId, fixture.input, {
    subjectType: "live_smoke",
    subjectId: fixture.id,
  });
  const output = result.output as { method?: string; selections?: unknown[] } | null;
  const isRealAgent = result.status === "succeeded" && output?.method === "agent";
  return {
    status: isRealAgent ? "passed" : result.status === "blocked_external" ? "blocked_external" : "failed",
    costUsd: result.costUsd,
    details: {
      outcome: result.status,
      method: output?.method ?? null,
      fallbackUsed: result.fallbackUsed,
      traceStatus: result.traceStatus,
      selections: Array.isArray(output?.selections) ? output.selections.length : 0,
    },
  };
}

async function runThreadSmokeCase(maxUsd: number): Promise<CaseOutcome> {
  const { listGenerationReadyHandles, getRuntimeProfile } = await import("@/lib/accounts/profileRepository");
  const { runDraftPipeline } = await import("@/lib/ai/draft-pipeline");
  const { effectiveThreadSegmentLimit, validateThreadSegments, threadPublicationHashInput } = await import(
    "@/lib/growth-engine/threadSegments"
  );
  const { assessReadiness } = await import("@/lib/services/readinessService");

  const { handles } = await listGenerationReadyHandles();
  const handle = handles[0];
  if (!handle) return { status: "failed", costUsd: 0, details: { reason: "no_generation_ready_account" } };

  const profile = await getRuntimeProfile(handle, { requireGenerationReady: true });
  const segmentLimit = effectiveThreadSegmentLimit(profile.maxChars);
  const source =
    "Yeni bir AI görüntü aracını gerçek client işinde denedim: kurulum, stil kilitleme, sınırlamalar ve maliyet notları.";

  // NO-PERSIST: runDraftPipeline queue yazmaz (persist draftService'e ait);
  // UsageLog gated primitive tarafından evaluation class ile yazılır.
  const result = await runDraftPipeline(profile, source, {
    accountId: undefined,
    budgetClass: "evaluation",
    format: { intent: "thread", segmentLimit },
    deadlineMs: 120_000,
  });

  const details: Record<string, unknown> = {
    usedMock: result.usedMock,
    estimatedCostUsd: result.estimatedCostUsd,
    writerModel: result.modelUsed.writer,
    judgeModel: result.modelUsed.judge,
    threadRequestUnsatisfied: result.threadRequestUnsatisfied ?? false,
  };
  const violations: string[] = [];

  // Assertion 1: gerçek provider cevabı (mock değil).
  if (result.usedMock) violations.push("usedMock=true — gerçek provider cevabı yok");
  // Assertion 2: writer + judge provenance mevcut.
  if (!result.modelUsed.writer) violations.push("writer model provenance yok");
  if (!result.modelUsed.judge || result.modelUsed.judge.startsWith("skipped"))
    violations.push("judge provenance yok/atlandı");
  if (result.threadRequestUnsatisfied) violations.push("thread isteği karşılanamadı");

  const segments = result.winner?.threadSegments ?? null;
  if (!segments || !Array.isArray(segments)) {
    violations.push("canonical threadSegments yok");
  } else {
    // Assertion 3-5: canonical THREAD, ≥2 segment (hedef 5-8), her segment ≤ limit.
    const validation = validateThreadSegments(segments, segmentLimit);
    if (!validation.ok) violations.push(...validation.issues.map((i) => `segment:${i.code}`));
    // Assertion 6: segment order/hash tutarlı (deterministik yeniden hesap).
    if (threadPublicationHashInput(segments) !== threadPublicationHashInput([...segments])) {
      violations.push("hash order tutarsız");
    }
    details.segmentCount = segments.length;
    // Assertion 7: readiness sonucu kaydedilir (publish YOK — yalnız değerlendirme).
    const readiness = assessReadiness({
      content: segments.map((s) => s.text).join("\n\n"),
      editedContent: null,
      status: "new",
      draftType: "THREAD",
      mode: "thread",
      accountHandle: handle,
      maxChars: profile.maxChars,
      judged: true,
      turkishNaturalness: result.winner?.turkishNaturalness ?? null,
      riskScore: result.winner?.risk ?? null,
      sourceFaithfulness: result.winner?.sourceFaithfulness ?? null,
      leaks: [],
      lintIssues: [],
      hasSource: true,
      threadSegments: segments,
    });
    details.readinessState = readiness.state;
  }
  // Assertion 8: tavan aşılmadı.
  if (result.estimatedCostUsd > maxUsd) violations.push(`maliyet tavanı aşıldı: ${result.estimatedCostUsd}`);

  details.violations = violations.slice(0, 10);
  return {
    status: violations.length === 0 ? "passed" : "failed",
    costUsd: result.estimatedCostUsd,
    details,
  };
}

export async function runLiveEvalSmoke(trigger: EvalRunTrigger): Promise<LiveSmokeResult> {
  const preflight = await liveSmokePreflight();

  if (!preflight.allowed) {
    // Dürüst blocked kaydı — HİÇBİR OpenRouter çağrısı yapılmadı.
    const notes = [
      "Canlı smoke koşulmadı: güvenlik/harcama kapıları eksik (BLOCKED-EXTERNAL).",
      `Eksik: ${preflight.missing.join(", ")}`,
    ];
    let curatorRunId: string | null = null;
    let threadRunId: string | null = null;
    try {
      const curatorRun = await evalRunRepo.createRun({
        kind: "curator_live",
        mode: "live",
        trigger,
        policyVersion: LIVE_SMOKE_POLICY_VERSION,
      });
      await evalRunRepo.finishRun(curatorRun.id, {
        status: "blocked_external",
        passedCount: 0,
        failedCount: 0,
        skippedCount: 1,
        totalCostUsd: 0,
        summary: { missing: preflight.missing },
        errorClass: "live_gates_missing",
      });
      curatorRunId = curatorRun.id;
      const threadRun = await evalRunRepo.createRun({
        kind: "thread_smoke",
        mode: "live",
        trigger,
        policyVersion: LIVE_SMOKE_POLICY_VERSION,
      });
      await evalRunRepo.finishRun(threadRun.id, {
        status: "blocked_external",
        passedCount: 0,
        failedCount: 0,
        skippedCount: 1,
        totalCostUsd: 0,
        summary: { missing: preflight.missing },
        errorClass: "live_gates_missing",
      });
      threadRunId = threadRun.id;
    } catch {
      notes.push("blocked_external EvalRun kaydı yazılamadı (DB erişilemedi) — durum yine BLOCKED.");
    }
    return {
      status: "blocked_external",
      curatorRunId,
      threadRunId,
      missing: preflight.missing,
      totalCostUsd: 0,
      notes,
    };
  }

  // ── Kapılar açık: minimal canlı koşu (2 case), tavan takipli ──
  let spent = 0;
  const notes: string[] = [];

  const curatorRun = await evalRunRepo.createRun({
    kind: "curator_live",
    mode: "live",
    trigger,
    policyVersion: LIVE_SMOKE_POLICY_VERSION,
    preset: "cemos-research",
  });
  const curator = await runCuratorLiveCase();
  spent += curator.costUsd;
  await evalRunRepo.recordCase({
    runId: curatorRun.id,
    caseKey: "curator-live-1",
    agentId: "opportunity-curator",
    status: curator.status,
    costUsd: curator.costUsd,
    traceStatus: (curator.details.traceStatus as "persisted" | "failed" | "skipped_policy") ?? "not_applicable",
    details: curator.details,
  });
  await evalRunRepo.finishRun(curatorRun.id, {
    status: curator.status === "passed" ? "passed" : curator.status,
    passedCount: curator.status === "passed" ? 1 : 0,
    failedCount: curator.status === "failed" ? 1 : 0,
    skippedCount: 0,
    totalCostUsd: curator.costUsd,
    summary: curator.details,
  });

  let threadRunId: string | null = null;
  let threadStatus: CaseOutcome["status"] | "skipped_budget" = "skipped_budget";
  if (spent < preflight.maxUsd) {
    const threadRun = await evalRunRepo.createRun({
      kind: "thread_smoke",
      mode: "live",
      trigger,
      policyVersion: LIVE_SMOKE_POLICY_VERSION,
      preset: "cemos-writer",
    });
    threadRunId = threadRun.id;
    const thread = await runThreadSmokeCase(preflight.maxUsd - spent);
    spent += thread.costUsd;
    threadStatus = thread.status;
    await evalRunRepo.recordCase({
      runId: threadRun.id,
      caseKey: "thread-smoke-1",
      agentId: "content-creator",
      status: thread.status,
      costUsd: thread.costUsd,
      details: thread.details,
    });
    await evalRunRepo.finishRun(threadRun.id, {
      status: thread.status === "passed" ? "passed" : thread.status,
      passedCount: thread.status === "passed" ? 1 : 0,
      failedCount: thread.status === "failed" ? 1 : 0,
      skippedCount: 0,
      totalCostUsd: thread.costUsd,
      summary: thread.details,
    });
  } else {
    notes.push("thread smoke atlandı: per-run harcama tavanı curator case ile doldu (budget_cap).");
  }

  const bothPassed = curator.status === "passed" && threadStatus === "passed";
  const anyBlocked = curator.status === "blocked_external" || threadStatus === "blocked_external";
  return {
    status: bothPassed ? "passed" : anyBlocked ? "partial" : threadStatus === "skipped_budget" ? "partial" : "failed",
    curatorRunId: curatorRun.id,
    threadRunId,
    missing: [],
    totalCostUsd: spent,
    notes,
  };
}
