import type { GenerateJsonResult } from "@/lib/ai/openrouter";
import { generateJsonGated } from "@/lib/ai/generateGated";
import type { ModelRole } from "@/lib/ai/model-config";
import { pipelineTraceRepo, type PipelineTraceStage } from "@/lib/db/pipelineTraceRepo";

/**
 * Pipeline runner (Faz G). Every generation chain runs its LLM stages through
 * one traced primitive so we get a uniform, viewable "pipeline izi" without
 * changing any chain's control flow. runStage wraps the budget-gated LLM call
 * 1:1 — same args, same return value — and additionally times the call and
 * records a trace entry. Dalga 2 (Sprint 2): runStage artık generateJsonGated
 * kullanır → her stage bütçe-kapılı ve tam 1 UsageLog yazar (purpose =
 * pipelineId, platform = trace platform); çağıranlar AYRICA loglamamalı.
 * flush writes the accumulated trace best-effort (it NEVER throws, so a
 * trace-write failure can never abort a generation).
 */

export type TraceMeta = {
  platform: string;
  pipelineId: string;
  subjectType: string;
  subjectId: string;
};

export type RunStageOptions = {
  stage: string;
  role: ModelRole;
  /** Try these roles in order before failing (e.g. premiumCreative → creativeWriter). */
  roleFallback?: ModelRole[];
  system: string;
  user: string;
  temperature?: number;
  /** Optional numeric score to surface on the trace entry. */
  score?: number;
};

export type PipelineTraceCollector = {
  runStage<T>(opts: RunStageOptions): Promise<GenerateJsonResult<T>>;
  flush(totalCostUsd: number): Promise<void>;
  /** Current accumulated stage entries (mainly for tests/introspection). */
  readonly stages: PipelineTraceStage[];
};

export function createPipelineTrace(meta: TraceMeta): PipelineTraceCollector {
  const stages: PipelineTraceStage[] = [];

  async function runStage<T>(opts: RunStageOptions): Promise<GenerateJsonResult<T>> {
    const roles: ModelRole[] = [opts.role, ...(opts.roleFallback ?? [])];
    const start = Date.now();
    let lastErr: unknown;

    for (let i = 0; i < roles.length; i++) {
      try {
        const r = await generateJsonGated<T>({
          role: roles[i],
          system: opts.system,
          user: opts.user,
          temperature: opts.temperature,
          purpose: meta.pipelineId,
          platform: meta.platform,
          meta: { stage: opts.stage },
        });
        stages.push({
          stage: opts.stage,
          role: roles[i],
          model: r.model,
          ok: true,
          failOpenUsed: i > 0, // a fallback role had to be used
          ms: Date.now() - start,
          costUsd: r.actualCostUsd,
          score: opts.score,
        });
        return r;
      } catch (e) {
        lastErr = e;
      }
    }

    // Every role failed — record the failed stage, then rethrow so the caller's
    // own fail-open (warning + continue, or failOpen default) takes over.
    stages.push({
      stage: opts.stage,
      role: roles[roles.length - 1],
      model: "",
      ok: false,
      failOpenUsed: true,
      ms: Date.now() - start,
      costUsd: 0,
    });
    throw lastErr;
  }

  async function flush(totalCostUsd: number): Promise<void> {
    if (stages.length === 0) return;
    try {
      await pipelineTraceRepo.create({
        platform: meta.platform,
        pipelineId: meta.pipelineId,
        subjectType: meta.subjectType,
        subjectId: meta.subjectId,
        stages,
        totalCostUsd,
      });
    } catch {
      /* best-effort: a trace-write failure must never block production */
    }
  }

  return { runStage, flush, stages };
}
