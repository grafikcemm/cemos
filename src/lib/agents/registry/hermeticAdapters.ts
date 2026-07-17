import type { AgentAdapter, AgentAdapterRun } from "./types";
import { AGENT_ADAPTERS } from "./adapters";

/**
 * Hermetic eval adapter'ları (ADR-034 §C). Deterministik registry contract
 * eval'i sırasında network/social-sync/memory-write/publish/DB-mutation
 * gerçekleştiren adapter'lar GERÇEK adapter üzerinden ÇALIŞTIRILMAZ — burada
 * şema-geçerli, sabit (canned) çıktı dönen mock'lar kullanılır.
 *
 * İki istisna GERÇEK kod yolunu koşar çünkü yan etkisizdirler:
 *  - originality-critic → near-duplicate-check (saf metin benzerliği)
 *  - opportunity-curator → gerçek deterministik kürasyon yolu
 *    (runDeterministicFallback; LLM gate'ine hiç dokunmaz)
 *
 * DÜRÜSTLÜK: hermetic mock geçişi "production agent doğrulandı" iddiası
 * DEĞİLDİR — runner sonucu her zaman mode=deterministic etiketler.
 */

function canned(output: Record<string, unknown>): AgentAdapter["run"] {
  return async (): Promise<AgentAdapterRun> => ({ output, costUsd: 0 });
}

function hermetic(agentLikeId: string, run: AgentAdapter["run"]): AgentAdapter {
  return {
    id: `hermetic:${agentLikeId}`,
    // Boş kullanım bildirimi: hermetic adapter hiçbir capability/memory-write
    // KULLANMAZ — executor allowlist denetiminden her tanım altında geçer.
    capabilitiesUsed: [],
    memoryWritesUsed: [],
    run,
  };
}

/** Şema-geçerli sabit çıktılar (summaryOutput = passthrough obje). */
const CANNED_OUTPUTS: Record<string, Record<string, unknown>> = {
  "cem-orchestrator": { hermetic: true, accountsProcessed: 1, draftsCreated: 0 },
  "trend-scout": { hermetic: true, discovered: 0 },
  "account-strategist": { hermetic: true, best: null, usedLlm: false },
  "content-creator": { hermetic: true, winner: null, usedMock: true },
  "viral-editor": { hermetic: true, publishScore: 50 },
  "brand-guardian": { hermetic: true, verdict: "neutral" },
  "fact-checker": { hermetic: true, verified: false, reason: "hermetic_no_network" },
  "competitor-analyst": { hermetic: true, synced: 0 },
  "reels-planner": { hermetic: true, slots: [] },
  "performance-learner": { hermetic: true, matched: 0 },
  "knowledge-curator": { hermetic: true, advanced: 0 },
};

/**
 * agentId için hermetic adapter döndürür; bilinmeyen id → null (runner case'i
 * fail-closed "no_hermetic_adapter" olarak işaretler).
 */
export function hermeticAdapterFor(agentId: string): AgentAdapter | null {
  if (agentId === "originality-critic") {
    // Saf yol — gerçek adapter güvenli.
    const real = AGENT_ADAPTERS["near-duplicate-check"];
    return real ? { ...real, id: "hermetic:originality-critic", capabilitiesUsed: [], memoryWritesUsed: [] } : null;
  }
  if (agentId === "opportunity-curator") {
    const real = AGENT_ADAPTERS["opportunity-curate"];
    if (!real?.runDeterministicFallback) return null;
    const fallbackRun = real.runDeterministicFallback.bind(real);
    return hermetic("opportunity-curator", (input, ctx) => fallbackRun(input, ctx));
  }
  const cannedOutput = CANNED_OUTPUTS[agentId];
  if (!cannedOutput) return null;
  return hermetic(agentId, canned(cannedOutput));
}
