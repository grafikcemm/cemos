import type { z } from "zod";
import { BudgetExceededError } from "@/lib/config/costGate";
import { pipelineTraceRepo, type PipelineTraceStage } from "@/lib/db/pipelineTraceRepo";
import { AGENT_ADAPTERS } from "./adapters";
import { AGENT_DEFINITIONS } from "./definitions";
import {
  AgentBlockedError,
  type AgentAdapter,
  type AgentAdapterContext,
  type AgentAdapterRun,
  type AgentDefinition,
  type AgentRunResult,
  type AgentRunStatus,
} from "./types";

/**
 * Registry executor (ADR-027) — her agent/skill koşusu bu sırayla geçer:
 *  1. Tanım çözülür (bilinmeyen/disabled id çalışamaz)
 *  2. Input Zod doğrulaması (fail-closed)
 *  3. Capability + memory izin doğrulaması (adapter ≤ tanım allowlist'i)
 *  4. Blocked-external / bütçe kontrolü (LLM kapalı/kredisizken SAHTE AI sonucu YOK)
 *  5. Allowlist'li adapter koşusu (timeout + retry politikası)
 *  6. Output Zod doğrulaması (fail-closed; fallback varsa deterministik yola düşer)
 *  7. Trace (best-effort; kaybı ölçülür — getLostTraceCount)
 *  8. Maliyet sahipliği: ücretli çağrının UsageLog'unu gated primitive yazar,
 *     executor ASLA ikinci UsageLog yazmaz; deterministik koşu costUsd=0.
 *  9. Typed sonuç
 */

export type ExecuteAgentContext = {
  subjectType: string;
  subjectId: string;
  platform?: string;
  accountId?: string;
  /** Test enjeksiyonu: adapter'ı değiştirir (yalnız test). */
  adapterOverride?: AgentAdapter;
  /** Test enjeksiyonu: tanım listesi (yalnız test). */
  definitionsOverride?: AgentDefinition[];
};

let lostTraceCount = 0;
/** Trace yazımı üretimi bloklamaz ama kaybı sessiz de değildir — ölçülür. */
export function getLostTraceCount(): number {
  return lostTraceCount;
}

function resolveDefinition(agentId: string, ctx: ExecuteAgentContext): AgentDefinition | null {
  const defs = ctx.definitionsOverride ?? AGENT_DEFINITIONS;
  return defs.find((d) => d.id === agentId) ?? null;
}

function baseResult(def: AgentDefinition, status: AgentRunStatus, startedAt: number): AgentRunResult {
  return {
    agentId: def.id,
    agentVersion: def.version,
    adapterId: def.adapterId,
    status,
    output: null,
    fallbackUsed: false,
    latencyMs: Date.now() - startedAt,
    retryCount: 0,
    costUsd: 0,
  };
}

class AgentTimeoutError extends Error {
  constructor(ms: number) {
    super(`Agent zaman aşımı: ${ms}ms`);
    this.name = "AgentTimeoutError";
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AgentTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isBlocked(e: unknown): { blocked: boolean; reason: string } {
  if (e instanceof AgentBlockedError) return { blocked: true, reason: e.reason };
  if (e instanceof BudgetExceededError) return { blocked: true, reason: `budget:${e.reason}` };
  return { blocked: false, reason: "" };
}

async function writeTrace(def: AgentDefinition, result: AgentRunResult, ctx: ExecuteAgentContext): Promise<void> {
  // tracePolicy "on_llm": deterministik başarıda stage yazılmaz (gürültü değil,
  // maliyet de yok); hata/fallback/blocked HER ZAMAN yazılır (sessiz fail-open yok).
  const uneventfulDeterministic =
    def.tracePolicy === "on_llm" && def.executionMode === "deterministic" && result.status === "succeeded";
  if (uneventfulDeterministic) return;

  const stage: PipelineTraceStage = {
    stage: def.id,
    role: def.preset ?? "deterministic",
    model: "",
    ok: result.status === "succeeded" || result.status === "deterministic_fallback",
    failOpenUsed: result.fallbackUsed,
    ms: result.latencyMs,
    costUsd: result.costUsd,
    agentId: def.id,
    agentVersion: def.version,
    adapterId: def.adapterId,
    executionMode: def.executionMode,
    preset: def.preset ?? undefined,
    outcome: result.status,
    fallbackUsed: result.fallbackUsed,
    blockedReason: result.blockedReason,
    retryCount: result.retryCount,
    estimatedCostUsd: result.costUsd,
    inputSchemaVersion: def.version,
    outputSchemaVersion: def.version,
    policyVersion: def.policyVersion,
  };
  try {
    await pipelineTraceRepo.create({
      platform: ctx.platform ?? "x",
      pipelineId: "agent_registry",
      subjectType: ctx.subjectType,
      subjectId: ctx.subjectId,
      stages: [stage],
      totalCostUsd: result.costUsd,
    });
  } catch {
    lostTraceCount += 1; // best-effort ama ölçülebilir (ADR-027)
  }
}

async function runFallback(
  def: AgentDefinition,
  adapter: AgentAdapter,
  input: unknown,
  adapterCtx: AgentAdapterContext,
  result: AgentRunResult,
  blockedReason: string
): Promise<AgentRunResult> {
  if (!adapter.runDeterministicFallback || def.fallback.kind !== "deterministic") {
    // Fallback yoksa çağıranın statüsü korunur (failed_validation ya da
    // blocked_external) — durum sınıfı değiştirilmez.
    return { ...result, blockedReason };
  }
  try {
    const fb = await withTimeout(adapter.runDeterministicFallback(input, adapterCtx), def.timeoutMs);
    const outParsed = (def.outputSchema as z.ZodTypeAny).safeParse(fb.output);
    if (!outParsed.success) {
      return {
        ...result,
        status: "failed_validation",
        blockedReason,
        errorMessage: `Fallback çıktısı şemadan geçmedi: ${outParsed.error.issues[0]?.message ?? "?"}`,
      };
    }
    return {
      ...result,
      status: "deterministic_fallback",
      output: outParsed.data,
      fallbackUsed: true,
      blockedReason,
      costUsd: 0, // deterministik koşu maliyeti açıkça 0
    };
  } catch (e) {
    return {
      ...result,
      status: "failed_execution",
      blockedReason,
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function executeAgent<T = unknown>(
  agentId: string,
  input: unknown,
  ctx: ExecuteAgentContext
): Promise<AgentRunResult<T>> {
  const startedAt = Date.now();
  const def = resolveDefinition(agentId, ctx);
  if (!def) {
    return {
      agentId,
      agentVersion: "",
      adapterId: "",
      status: "failed_execution",
      output: null,
      fallbackUsed: false,
      errorMessage: `Bilinmeyen agent id: ${agentId}`,
      latencyMs: Date.now() - startedAt,
      retryCount: 0,
      costUsd: 0,
    } as AgentRunResult<T>;
  }

  if (def.status === "blocked_external") {
    const r = { ...baseResult(def, "blocked_external", startedAt), blockedReason: "entry_blocked_external" };
    await writeTrace(def, r, ctx);
    return r as AgentRunResult<T>;
  }
  if (def.status === "disabled") {
    const r = { ...baseResult(def, "failed_execution", startedAt), errorMessage: "Agent devre dışı (disabled)." };
    await writeTrace(def, r, ctx);
    return r as AgentRunResult<T>;
  }

  const adapter = ctx.adapterOverride ?? AGENT_ADAPTERS[def.adapterId];
  if (!adapter) {
    const r = { ...baseResult(def, "failed_execution", startedAt), errorMessage: `Adapter yok: ${def.adapterId}` };
    await writeTrace(def, r, ctx);
    return r as AgentRunResult<T>;
  }

  // 3 — capability/memory izinleri: adapter tanımın allowlist'ini aşamaz.
  const capViolation = adapter.capabilitiesUsed.find((c) => !def.allowedCapabilities.includes(c));
  const memViolation = adapter.memoryWritesUsed.find((m) => !def.memoryWriteScopes.includes(m));
  if (capViolation || memViolation) {
    const r = {
      ...baseResult(def, "failed_execution", startedAt),
      errorMessage: capViolation
        ? `Capability ihlali: adapter "${adapter.id}" → "${capViolation}"`
        : `Memory-write ihlali: adapter "${adapter.id}" → "${memViolation}"`,
    };
    await writeTrace(def, r, ctx);
    return r as AgentRunResult<T>;
  }

  // 2 — input doğrulaması (adapter koşmadan; maliyet 0).
  const inParsed = (def.inputSchema as z.ZodTypeAny).safeParse(input);
  if (!inParsed.success) {
    const r = {
      ...baseResult(def, "failed_validation", startedAt),
      errorMessage: `Girdi şemadan geçmedi: ${inParsed.error.issues[0]?.message ?? "?"}`,
    };
    await writeTrace(def, r, ctx);
    return r as AgentRunResult<T>;
  }

  const adapterCtx: AgentAdapterContext = {
    subjectType: ctx.subjectType,
    subjectId: ctx.subjectId,
    platform: ctx.platform ?? "x",
    accountId: ctx.accountId,
  };

  let retryCount = 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= def.retry.maxAttempts; attempt++) {
    retryCount = attempt;
    try {
      const run: AgentAdapterRun = await withTimeout(adapter.run(inParsed.data, adapterCtx), def.timeoutMs);
      const outParsed = (def.outputSchema as z.ZodTypeAny).safeParse(run.output);
      if (!outParsed.success) {
        // Output ihlali fail-closed'dur; fallback varsa deterministik yola düşer
        // (ör. LLM kürasyonunda uydurma sourceId → deterministik sıralama korunur).
        const invalid = {
          ...baseResult(def, "failed_validation", startedAt),
          retryCount,
          errorMessage: `Çıktı şemadan geçmedi: ${outParsed.error.issues[0]?.message ?? "?"}`,
        };
        const r = await runFallback(def, adapter, inParsed.data, adapterCtx, invalid, "output_validation_failed");
        const final = { ...r, latencyMs: Date.now() - startedAt };
        await writeTrace(def, final, ctx);
        return final as AgentRunResult<T>;
      }
      const r: AgentRunResult = {
        ...baseResult(def, "succeeded", startedAt),
        output: outParsed.data,
        retryCount,
        costUsd: run.costUsd,
      };
      await writeTrace(def, r, ctx);
      return r as AgentRunResult<T>;
    } catch (e) {
      // Sıra önemli: blocked (bütçe/dış engel) retry EDİLMEZ → fallback/blocked.
      const b = isBlocked(e);
      if (b.blocked) {
        const blockedBase = { ...baseResult(def, "blocked_external", startedAt), retryCount };
        const r = await runFallback(def, adapter, inParsed.data, adapterCtx, blockedBase, b.reason);
        const final = { ...r, latencyMs: Date.now() - startedAt };
        await writeTrace(def, final, ctx);
        return final as AgentRunResult<T>;
      }
      if (e instanceof AgentTimeoutError) {
        const r = { ...baseResult(def, "timed_out", startedAt), retryCount, errorMessage: e.message };
        await writeTrace(def, r, ctx);
        return r as AgentRunResult<T>;
      }
      lastError = e; // failed_execution → retry politikası izin verdiği sürece dene
    }
  }

  const r = {
    ...baseResult(def, "failed_execution", startedAt),
    retryCount,
    errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
  };
  await writeTrace(def, r, ctx);
  return r as AgentRunResult<T>;
}
