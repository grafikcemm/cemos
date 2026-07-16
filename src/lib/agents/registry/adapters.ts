import type { AgentAdapter, AgentAdapterContext, AgentAdapterRun } from "./types";
import {
  CuratorInputSchema,
  runAgentCuration,
  runDeterministicCuration,
} from "./opportunityCurator";

/**
 * SERVER-SIDE adapter allowlist'i (ADR-027). Registry tanımları yalnız veridir;
 * çalıştırılabilir köprüler SADECE buradadır ve her biri MEVCUT servise
 * delege eder — yeni agent yazılmaz (07-PHASE2-PLAN §1 envanteri).
 *
 * Güvenlik sınırı:
 *  - Bu modül client bundle'ına GİRMEZ (yalnız route/servis tarafından import).
 *  - Delegasyonlar sabit literal modül yollarıdır (keyfî dynamic import yok);
 *    lazy import yalnız ağır servis zincirlerini registry doğrulamasından
 *    ayırmak içindir.
 *  - Ücretli çağrılar delege edilen servislerin İÇİNDEKİ generateJsonGated
 *    üzerinden akar: bütçe kapısı + tek-UsageLog sahipliği orada kalır;
 *    adapter/executor AYRICA UsageLog yazmaz. Deterministik koşu costUsd=0.
 */

function summarize(output: unknown, costUsd = 0): AgentAdapterRun {
  return { output, costUsd };
}

/** ADR-031: handle doğrulaması DB-otoriteli fail-closed (literal union değil). */
async function assertHandle(handle: string): Promise<string> {
  const { assertKnownAccountHandleDb } = await import("@/lib/accounts/profileRepository");
  return assertKnownAccountHandleDb(handle);
}

export const AGENT_ADAPTERS: Record<string, AgentAdapter> = {
  "pipeline-daily-run": {
    id: "pipeline-daily-run",
    capabilitiesUsed: ["db:read", "db:write:queue", "llm:generate", "memory:read", "net:social_sources"],
    memoryWritesUsed: [],
    async run(input) {
      const { accountHandle, deadlineMs } = input as { accountHandle: string; deadlineMs?: number };
      const { pipelineService } = await import("@/lib/services/pipelineService");
      const handle = await assertHandle(accountHandle);
      const summary = await pipelineService.runDailyForAccount(handle, deadlineMs ? { deadlineMs } : undefined);
      return summarize(summary);
    },
  },

  "trend-scout-compose": {
    id: "trend-scout-compose",
    capabilitiesUsed: ["db:read", "llm:generate", "net:social_sources"],
    memoryWritesUsed: [],
    async run(input) {
      const { accountHandle } = input as { accountHandle: string };
      const { discoveryService } = await import("@/lib/services/discoveryService");
      const summary = await discoveryService.discoverForAccount(await assertHandle(accountHandle));
      return summarize(summary);
    },
  },

  "router-route-item": {
    id: "router-route-item",
    capabilitiesUsed: ["llm:generate", "memory:read"],
    memoryWritesUsed: [],
    async run(input) {
      const { text } = input as { text: string };
      const { routeItem } = await import("@/lib/agents/router");
      return summarize(await routeItem(text));
    },
  },

  "draft-pipeline-run": {
    id: "draft-pipeline-run",
    capabilitiesUsed: ["db:read", "llm:generate", "memory:read"],
    memoryWritesUsed: [],
    async run(input) {
      const { accountHandle, sourceText } = input as { accountHandle: string; sourceText: string };
      const { getRuntimeProfile } = await import("@/lib/accounts/profileRepository");
      const { runDraftPipeline } = await import("@/lib/ai/draft-pipeline");
      // ADR-031: profil DB'den — üretim-hazır olmayan hesap fail-closed.
      const profile = await getRuntimeProfile(accountHandle, { requireGenerationReady: true });
      const result = await runDraftPipeline(profile, sourceText);
      return summarize(result, result.estimatedCostUsd ?? 0);
    },
  },

  "scorer-score-draft": {
    id: "scorer-score-draft",
    capabilitiesUsed: ["llm:generate"],
    memoryWritesUsed: [],
    async run(input) {
      const { accountHandle, content } = input as { accountHandle: string; content: string };
      const { scoreDraft } = await import("@/lib/growth-engine/scorer");
      return summarize(await scoreDraft({ accountHandle, content }));
    },
  },

  "council-deliberate": {
    id: "council-deliberate",
    capabilitiesUsed: ["llm:generate", "memory:read"],
    memoryWritesUsed: [],
    async run(input) {
      const { text, accountHandle } = input as { text: string; accountHandle: string };
      const { deliberate } = await import("@/lib/agents/council");
      return summarize(await deliberate(text, await assertHandle(accountHandle)));
    },
  },

  "verify-website": {
    id: "verify-website",
    capabilitiesUsed: ["db:read", "net:verify_website"],
    memoryWritesUsed: [],
    async run(input) {
      const { url } = input as { url: string };
      const { verifyWebsite } = await import("@/lib/verify/verifyWebsite");
      return summarize(await verifyWebsite(url));
    },
  },

  "near-duplicate-check": {
    id: "near-duplicate-check",
    capabilitiesUsed: ["db:read"],
    memoryWritesUsed: [],
    async run(input) {
      const { text, corpus } = input as { text: string; corpus: string[] };
      const { isNearDuplicate } = await import("@/lib/utils/textSimilarity");
      const matchedIndex = corpus.findIndex((c) => isNearDuplicate(text, c));
      return summarize({ nearDuplicate: matchedIndex >= 0, matchedIndex: matchedIndex >= 0 ? matchedIndex : null });
    },
  },

  "competitor-sync": {
    id: "competitor-sync",
    capabilitiesUsed: ["db:read", "net:meta_graph", "net:youtube"],
    memoryWritesUsed: [],
    async run(input) {
      const { platform } = input as { platform: "instagram" | "youtube" };
      if (platform === "instagram") {
        const { syncIgCompetitors } = await import("@/lib/instagram/competitor/igCompetitorService");
        return summarize(await syncIgCompetitors());
      }
      const { youtubeService } = await import("@/lib/services/youtubeService");
      return summarize(await youtubeService.syncCompetitors({ deadlineMs: 90_000 }));
    },
  },

  "reels-plan-assemble": {
    id: "reels-plan-assemble",
    capabilitiesUsed: ["db:read", "db:write:plan", "llm:generate", "net:verify_website"],
    memoryWritesUsed: [],
    async run(input) {
      const { assembleMonthlyPlan } = await import("@/lib/reels/plan-assembler");
      // Saf montaj yolu; dossier üretimi kendi route'unda kalır (ADR-024).
      return summarize(assembleMonthlyPlan(input as Parameters<typeof assembleMonthlyPlan>[0]));
    },
  },

  "engagement-sync": {
    id: "engagement-sync",
    capabilitiesUsed: ["db:read", "memory:write:episodic", "net:social_sources"],
    memoryWritesUsed: ["episodic", "performance"],
    async run(input) {
      const { accountHandle } = input as { accountHandle: string };
      const { engagementLearningService } = await import("@/lib/services/engagementLearningService");
      return summarize(await engagementLearningService.syncForAccount(await assertHandle(accountHandle)));
    },
  },

  "knowledge-advance": {
    id: "knowledge-advance",
    capabilitiesUsed: ["db:read", "db:write:learn", "llm:generate", "memory:read", "memory:write:identity"],
    memoryWritesUsed: ["knowledge", "identity"],
    async run(input) {
      const parsed = input as {
        action: "advance_job" | "consolidate_memory" | "reconcile_signals";
        jobId?: string;
        handles?: string[];
        deadlineMs?: number;
        lookbackDays?: number;
      };
      if (parsed.action === "advance_job") {
        if (!parsed.jobId) throw new Error("jobId gerekli (action=advance_job)");
        const { advanceJob } = await import("@/lib/learning/pipeline/orchestrator");
        return summarize(await advanceJob(parsed.jobId, { deadlineMs: parsed.deadlineMs ?? 120_000 }));
      }
      if (parsed.action === "reconcile_signals") {
        // Faz 2B (ADR-029): LLM'SİZ deterministik sinyal reconciliation'ı.
        const { reconcileFeedbackSignals } = await import("@/lib/memory/signalBridge");
        return summarize(await reconcileFeedbackSignals({ lookbackDays: parsed.lookbackDays }));
      }
      const { runMemoryConsolidation } = await import("@/lib/memory/consolidation");
      return summarize(
        await runMemoryConsolidation({ handles: parsed.handles ?? [], deadlineMs: parsed.deadlineMs ?? 120_000 })
      );
    },
  },

  "opportunity-curate": {
    id: "opportunity-curate",
    capabilitiesUsed: ["llm:generate"],
    memoryWritesUsed: [],
    async run(input) {
      const parsed = CuratorInputSchema.parse(input);
      // LLM yolu — kapalıyken AgentBlockedError fırlatır (ağ çağrısı YOK);
      // executor deterministik fallback'e düşürür ve bunu dürüstçe işaretler.
      return summarize(await runAgentCuration(parsed));
    },
    async runDeterministicFallback(input) {
      const parsed = CuratorInputSchema.parse(input);
      return summarize(runDeterministicCuration(parsed), 0);
    },
  },
};

export function getAdapter(adapterId: string, ctx?: AgentAdapterContext): AgentAdapter | undefined {
  void ctx;
  return AGENT_ADAPTERS[adapterId];
}
