/**
 * CemOS Learn — API route'ların çağırdığı tek façade. URL doğrulama, kaynak+job
 * yaratma, advance, pack okuma, dashboard, cron sweep. Business logic UI'a sızmaz.
 */

import { safeJsonParse } from "@/lib/growth-engine/types";
import { learnSourceRepo } from "@/lib/db/learnSourceRepo";
import { learnTranscriptRepo } from "@/lib/db/learnTranscriptRepo";
import { learnPackRepo, type PackWithRelations } from "@/lib/db/learnPackRepo";
import { learnJobRepo } from "@/lib/db/learnJobRepo";
import { learnReviewRepo } from "@/lib/db/learnReviewRepo";
import { extractVideoId } from "./pipeline/transcript-fetch";
import { advanceJob, type AdvanceResult } from "./pipeline/orchestrator";
import { stageProgress, STAGE_LABELS, type LearnStage } from "./pipeline/stages";
import {
  PIPELINE_VERSION,
  MIN_TRANSCRIPT_CHARS,
  STALE_LEASE_MS,
  LEARN_SWEEP_DEADLINE_MS,
  ADVANCE_DEADLINE_MS,
} from "./learnConfig";

export class InvalidSourceUrlError extends Error {
  readonly code = "invalid_url";
  constructor() {
    super("Geçerli bir YouTube URL'si girin.");
    this.name = "InvalidSourceUrlError";
  }
}

export type CreateSourceResult = {
  sourceId: string;
  jobId: string;
  videoId: string;
  alreadyReady: boolean;
};

export type JobView = {
  id: string;
  sourceId: string;
  currentStage: LearnStage;
  stageLabel: string;
  status: string;
  progress: number;
  error: string | null;
  packId: string | null;
};

function jobView(job: {
  id: string;
  sourceId: string;
  currentStage: string;
  status: string;
  lastError: string | null;
  stageStateJson: string;
}): JobView {
  const stage = job.currentStage as LearnStage;
  const state = safeJsonParse<{ packId?: string }>(job.stageStateJson, {});
  return {
    id: job.id,
    sourceId: job.sourceId,
    currentStage: stage,
    stageLabel: STAGE_LABELS[stage] ?? stage,
    status: job.status,
    progress: stageProgress(stage),
    error: job.lastError,
    packId: state.packId ?? null,
  };
}

export const learnService = {
  /** YouTube URL → kaynak + job (idempotent). manualTranscript verilirse transkript yazılır. */
  async createSource(input: {
    url: string;
    manualTranscript?: string;
  }): Promise<CreateSourceResult> {
    const videoId = extractVideoId(input.url);
    if (!videoId) throw new InvalidSourceUrlError();

    const source = await learnSourceRepo.upsertByExternal({
      kind: "youtube",
      externalId: videoId,
      url: input.url,
    });

    // Üst sınır: kaçak LLM maliyetini önlemek için manuel transkript ~200K char ile sınırlı.
    const manual = (input.manualTranscript ?? "").trim().slice(0, 200_000);
    if (manual.length >= MIN_TRANSCRIPT_CHARS) {
      await learnTranscriptRepo.upsert({
        sourceId: source.id,
        provider: "manual",
        lang: null,
        segmentsJson: "[]",
        fullText: manual,
      });
    }

    const job = await learnJobRepo.upsert({
      sourceId: source.id,
      pipelineVersion: PIPELINE_VERSION,
    });

    const existingPack = await learnPackRepo.findBySourceVersion(source.id, PIPELINE_VERSION);
    return {
      sourceId: source.id,
      jobId: job.id,
      videoId,
      alreadyReady: existingPack?.status === "ready",
    };
  },

  advance(jobId: string): Promise<AdvanceResult> {
    return advanceJob(jobId, { deadlineMs: ADVANCE_DEADLINE_MS });
  },

  /**
   * Transkript-yok hatasından sonra kullanıcının yapıştırdığı manuel transkripti
   * yazar (provider="manual") + kaynağı processing'e çeker → advance kaldığı yerden
   * devam edebilir. <MIN_TRANSCRIPT_CHARS ise false (yetersiz).
   */
  async setManualTranscript(sourceId: string, text: string): Promise<boolean> {
    const manual = (text ?? "").trim().slice(0, 200_000);
    if (manual.length < MIN_TRANSCRIPT_CHARS) return false;
    await learnTranscriptRepo.upsert({
      sourceId,
      provider: "manual",
      lang: null,
      segmentsJson: "[]",
      fullText: manual,
    });
    await learnSourceRepo.update(sourceId, { status: "processing" });
    return true;
  },

  async getJob(jobId: string): Promise<JobView | null> {
    const job = await learnJobRepo.getById(jobId);
    return job ? jobView(job) : null;
  },

  async getJobBySource(sourceId: string): Promise<JobView | null> {
    const job = await learnJobRepo.getBySource(sourceId);
    return job ? jobView(job) : null;
  },

  getPack(packId: string): Promise<PackWithRelations | null> {
    return learnPackRepo.getFull(packId);
  },

  getPackBySource(sourceId: string) {
    return learnPackRepo.findBySourceVersion(sourceId, PIPELINE_VERSION);
  },

  /** Pack detay DTO'su (UI): parsed özet/kavram/item/QA + transkript chunk'ları. */
  async getPackDetail(packId: string) {
    const pack = await learnPackRepo.getFull(packId);
    if (!pack) return null;
    const [source, chunks] = await Promise.all([
      learnSourceRepo.getById(pack.sourceId),
      learnTranscriptRepo.listChunks(pack.sourceId),
    ]);
    const firstChunk = (json: string) =>
      safeJsonParse<{ chunkIdx: number }[]>(json, [])[0]?.chunkIdx ?? null;
    return {
      id: pack.id,
      status: pack.status,
      category: pack.category,
      masteryScore: pack.masteryScore,
      costUsd: pack.costUsd,
      summaryL1: pack.summaryL1,
      summaryL2: pack.summaryL2,
      summaryL3: pack.summaryL3,
      qaReport: safeJsonParse<Record<string, unknown>>(pack.qaReportJson, {}),
      source: source
        ? { id: source.id, title: source.title, channelTitle: source.channelTitle, url: source.url, durationSec: source.durationSec }
        : null,
      concepts: pack.concepts.map((c) => ({
        id: c.id,
        label: c.label,
        definition: c.definition,
        importance: c.importance,
        masteryScore: c.masteryScore,
        grounding: safeJsonParse<{ chunkIdx: number }[]>(c.groundingJson, []),
      })),
      items: pack.items.map((it) => ({
        id: it.id,
        kind: it.kind,
        front: it.front,
        back: it.back,
        options: safeJsonParse<string[]>(it.optionsJson, []),
        correctIdx: it.correctIdx,
        difficulty: it.difficulty,
        groundingType: it.groundingType,
        chunkIdx: firstChunk(it.groundingJson),
      })),
      chunks: chunks.map((c) => ({ idx: c.idx, startSec: c.startSec, text: c.text })),
    };
  },

  async dashboard() {
    const now = new Date();
    const [sources, readyCount, dueCount, summaries] = await Promise.all([
      learnSourceRepo.list(50),
      learnPackRepo.countByStatus("ready"),
      learnReviewRepo.countDue(now),
      learnPackRepo.listSummaries(100),
    ]);
    const ready = summaries.filter((p) => p.status === "ready");
    const avgMastery =
      ready.length > 0
        ? Math.round(ready.reduce((sum, p) => sum + p.masteryScore, 0) / ready.length)
        : 0;
    // status→pack haritası (ready kaynakların pack'ine doğrudan link) + job (resume).
    const packBySource = new Map(summaries.map((p) => [p.sourceId, p]));
    const jobs = await Promise.all(sources.map((s) => learnJobRepo.getBySource(s.id)));
    return {
      sources: sources.map((s, i) => {
        const pack = packBySource.get(s.id);
        return {
          id: s.id,
          title: s.title,
          channelTitle: s.channelTitle,
          url: s.url,
          status: s.status,
          durationSec: s.durationSec,
          createdAt: s.createdAt,
          packId: pack?.id ?? null,
          packStatus: pack?.status ?? null,
          masteryScore: pack?.masteryScore ?? 0,
          category: pack?.category ?? "diger",
          jobId: jobs[i]?.id ?? null,
        };
      }),
      readyPacks: readyCount,
      dueToday: dueCount,
      avgMastery,
    };
  },

  /**
   * Cron sweep: client'ı kopmuş job'ları (bayat lease) kalan bütçede ilerletir.
   * Fail-open — bir job'ın hatası diğerini bozmaz, cron'u patlatmaz.
   */
  async sweepPendingJobs(opts: { deadlineMs: number }): Promise<{ swept: number; results: unknown[] }> {
    const t0 = Date.now();
    const stale = new Date(Date.now() - STALE_LEASE_MS);
    const jobs = await learnJobRepo.findSweepable(stale, 5);
    const results: unknown[] = [];
    let swept = 0;
    for (const job of jobs) {
      const remaining = opts.deadlineMs - (Date.now() - t0);
      if (remaining <= 2_000) break;
      try {
        const r = await advanceJob(job.id, {
          deadlineMs: Math.min(LEARN_SWEEP_DEADLINE_MS, remaining),
        });
        results.push({ jobId: job.id, status: r.status, stage: r.currentStage });
        swept += 1;
      } catch (err) {
        results.push({ jobId: job.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { swept, results };
  },
};
