/**
 * CemOS Learn — API route'ların çağırdığı tek façade. URL doğrulama, kaynak+job
 * yaratma, advance, pack okuma, dashboard, cron sweep. Business logic UI'a sızmaz.
 */

import { createHash } from "node:crypto";
import { safeJsonParse } from "@/lib/growth-engine/types";
import { learnSourceRepo } from "@/lib/db/learnSourceRepo";
import { learnTranscriptRepo } from "@/lib/db/learnTranscriptRepo";
import { learnPackRepo, type PackWithRelations } from "@/lib/db/learnPackRepo";
import { learnJobRepo } from "@/lib/db/learnJobRepo";
import { learnReviewRepo } from "@/lib/db/learnReviewRepo";
import { extractVideoId } from "./pipeline/transcript-fetch";
import { advanceJob, type AdvanceResult } from "./pipeline/orchestrator";
import { stageProgress, STAGE_LABELS, type LearnStage } from "./pipeline/stages";
import { basisForKind } from "@/lib/learning/types";
import { parseArtifact, graphToMermaid } from "@/lib/learning/artifact";
import { deriveLearnState, type LearnUserState } from "./status";
import {
  PIPELINE_VERSION,
  MIN_TRANSCRIPT_CHARS,
  STALE_LEASE_MS,
  LEARN_SWEEP_DEADLINE_MS,
  ADVANCE_DEADLINE_MS,
} from "./learnConfig";

const MAX_INTAKE_CHARS = 200_000;
/** Zaman damgası TAŞIYAN provider'lar (UI timestamp chip'i yalnız bunlarda gösterir). */
const TIMED_PROVIDERS = new Set(["innertube", "timedtext", "supadata", "gemini"]);

export class InvalidSourceUrlError extends Error {
  readonly code = "invalid_url";
  constructor() {
    super("Geçerli bir YouTube URL'si girin.");
    this.name = "InvalidSourceUrlError";
  }
}

export class InvalidSourceInputError extends Error {
  readonly code = "invalid_input";
  constructor(message = "Geçersiz veya çok kısa içerik.") {
    super(message);
    this.name = "InvalidSourceInputError";
  }
}

/** 4C-A intake sözleşmesi. İstemci provider/trust/verified BELİRLEYEMEZ — sunucu koyar. */
export type SourceIntake =
  | { kind: "youtube"; url: string; manualTranscript?: string }
  | { kind: "manual_transcript"; text: string; title?: string }
  | { kind: "notebooklm_summary"; summary: string; title?: string; sourceUrl?: string };

export type CreateSourceResult = {
  sourceId: string;
  jobId: string;
  /** youtube → videoId; manuel/NotebookLM → içerik SHA-256 (idempotent externalId). */
  videoId: string;
  alreadyReady: boolean;
};

/** İçerik → normalize (boşluk daralt) → SHA-256 externalId. Ham metin ID'ye/log'a YAZILMAZ. */
function hashContent(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 40);
}

/** Kaynak yaratıldıktan sonra job (idempotent) + mevcut pack durumu. */
async function finalizeNewSource(
  sourceId: string,
  externalId: string
): Promise<CreateSourceResult> {
  const job = await learnJobRepo.upsert({ sourceId, pipelineVersion: PIPELINE_VERSION });
  const existingPack = await learnPackRepo.findBySourceVersion(sourceId, PIPELINE_VERSION);
  return {
    sourceId,
    jobId: job.id,
    videoId: externalId,
    alreadyReady: existingPack?.status === "ready",
  };
}

export type JobView = {
  id: string;
  sourceId: string;
  currentStage: LearnStage;
  stageLabel: string;
  status: string;
  progress: number;
  error: string | null;
  packId: string | null;
  // 4C-E kanonik durum (processing UI ayrımı için)
  userState: LearnUserState;
  userStateLabel: string;
  canAdvance: boolean;
  needsManualTranscript: boolean;
};

function jobView(
  job: {
    id: string;
    sourceId: string;
    currentStage: string;
    status: string;
    lastError: string | null;
    stageStateJson: string;
  },
  ctx?: { sourceStatus?: string; packStatus?: string | null }
): JobView {
  const stage = job.currentStage as LearnStage;
  const state = safeJsonParse<{ packId?: string }>(job.stageStateJson, {});
  const derived = deriveLearnState({
    sourceStatus: ctx?.sourceStatus ?? "processing",
    jobStatus: job.status,
    jobStage: job.currentStage,
    jobError: job.lastError,
    packStatus: ctx?.packStatus ?? null,
  });
  return {
    id: job.id,
    sourceId: job.sourceId,
    currentStage: stage,
    stageLabel: STAGE_LABELS[stage] ?? stage,
    status: job.status,
    progress: stageProgress(stage),
    error: job.lastError,
    packId: state.packId ?? null,
    userState: derived.state,
    userStateLabel: derived.label,
    canAdvance: derived.canAdvance,
    needsManualTranscript: derived.needsManualTranscript,
  };
}

export const learnService = {
  /**
   * 4C-A intake: youtube | manual_transcript | notebooklm_summary → kaynak + job (idempotent).
   * youtube videoId ile, manuel/NotebookLM içerik SHA-256 ile idempotent. provider/basis
   * SUNUCU tarafından belirlenir. NotebookLM = summary basis (transcript-doğrulaması DEĞİL).
   */
  async createSource(input: SourceIntake): Promise<CreateSourceResult> {
    if (input.kind === "youtube") {
      const videoId = extractVideoId(input.url);
      if (!videoId) throw new InvalidSourceUrlError();
      const source = await learnSourceRepo.upsertByExternal({
        kind: "youtube",
        externalId: videoId,
        url: input.url,
      });
      // İsteğe bağlı manuel transkript (kaçak LLM maliyetine karşı ~200K sınır).
      const manual = (input.manualTranscript ?? "").trim().slice(0, MAX_INTAKE_CHARS);
      if (manual.length >= MIN_TRANSCRIPT_CHARS) {
        await learnTranscriptRepo.upsert({
          sourceId: source.id,
          provider: "manual",
          lang: null,
          segmentsJson: "[]",
          fullText: manual,
        });
      }
      return finalizeNewSource(source.id, videoId);
    }

    if (input.kind === "manual_transcript") {
      const text = (input.text ?? "").trim().slice(0, MAX_INTAKE_CHARS);
      if (text.length < MIN_TRANSCRIPT_CHARS) {
        throw new InvalidSourceInputError(
          `Transkript çok kısa (en az ${MIN_TRANSCRIPT_CHARS} karakter).`
        );
      }
      const externalId = hashContent(text); // aynı içerik tekrar → mevcut kaynak (idempotent)
      const source = await learnSourceRepo.upsertByExternal({
        kind: "manual_transcript",
        externalId,
        url: "",
        title: input.title?.trim() || "Manuel transkript",
        metaJson: JSON.stringify({ basis: "transcript", provider: "manual", addedVia: "manual_transcript" }),
      });
      await learnTranscriptRepo.upsert({
        sourceId: source.id,
        provider: "manual",
        lang: null,
        segmentsJson: "[]", // zaman damgası YOK — chunk aşaması düz metinden böler
        fullText: text,
      });
      await learnSourceRepo.update(source.id, { status: "processing" });
      return finalizeNewSource(source.id, externalId);
    }

    // notebooklm_summary — summary basis; source_supported ASLA (videoda doğrulanmadı).
    const summary = (input.summary ?? "").trim().slice(0, MAX_INTAKE_CHARS);
    if (summary.length < MIN_TRANSCRIPT_CHARS) {
      throw new InvalidSourceInputError(
        `Özet çok kısa (en az ${MIN_TRANSCRIPT_CHARS} karakter).`
      );
    }
    const externalId = hashContent(summary);
    const sourceUrl = (input.sourceUrl ?? "").trim().slice(0, 2000);
    const source = await learnSourceRepo.upsertByExternal({
      kind: "notebooklm_summary",
      externalId,
      url: sourceUrl, // opsiyonel; doğrulanmadan verified sayılmaz
      title: input.title?.trim() || "NotebookLM özeti",
      metaJson: JSON.stringify({
        basis: "summary",
        provider: "notebooklm",
        sourceUrl: sourceUrl || null,
        verified: false,
        addedVia: "notebooklm_summary",
      }),
    });
    await learnTranscriptRepo.upsert({
      sourceId: source.id,
      provider: "notebooklm",
      lang: null,
      segmentsJson: "[]",
      fullText: summary,
    });
    await learnSourceRepo.update(source.id, { status: "processing" });
    return finalizeNewSource(source.id, externalId);
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
    if (!job) return null;
    const [source, pack] = await Promise.all([
      learnSourceRepo.getById(job.sourceId),
      learnPackRepo.findBySourceVersion(job.sourceId, PIPELINE_VERSION),
    ]);
    return jobView(job, { sourceStatus: source?.status, packStatus: pack?.status ?? null });
  },

  async getJobBySource(sourceId: string): Promise<JobView | null> {
    const job = await learnJobRepo.getBySource(sourceId);
    if (!job) return null;
    const [source, pack] = await Promise.all([
      learnSourceRepo.getById(sourceId),
      learnPackRepo.findBySourceVersion(sourceId, PIPELINE_VERSION),
    ]);
    return jobView(job, { sourceStatus: source?.status, packStatus: pack?.status ?? null });
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
    const [source, chunks, transcript] = await Promise.all([
      learnSourceRepo.getById(pack.sourceId),
      learnTranscriptRepo.listChunks(pack.sourceId),
      learnTranscriptRepo.getBySource(pack.sourceId),
    ]);
    const basis = basisForKind(source?.kind ?? "youtube");
    const provider = transcript?.provider ?? null;
    const hasTimestamps = provider ? TIMED_PROVIDERS.has(provider) : false;
    const parsed = parseArtifact(pack.notesJson);
    const artifact = parsed.kind === "v2" ? parsed.artifact : null;
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
      pipelineVersion: pack.pipelineVersion,
      promptVersion: pack.promptVersion,
      sourceBasis: basis, // transcript | summary (NotebookLM)
      provider, // manual | notebooklm | innertube | ...
      hasTimestamps, // false → UI zaman damgası GÖSTERMEZ (manuel/NotebookLM)
      qaReport: safeJsonParse<Record<string, unknown>>(pack.qaReportJson, {}),
      source: source
        ? {
            id: source.id,
            kind: source.kind,
            title: source.title,
            channelTitle: source.channelTitle,
            url: source.url,
            durationSec: source.durationSec,
          }
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
      // ── v2 artifact (4C-D) — legacy/v1 pack'te boş (hasArtifact=false) ──
      hasArtifact: artifact !== null,
      atomicNotes: artifact?.atomicNotes ?? [],
      graph: artifact?.graph ?? { nodes: [], edges: [] },
      graphMermaid: artifact ? graphToMermaid(artifact.graph) : "",
      tasks: artifact?.tasks ?? [],
      contentIdeas: artifact?.contentIdeas ?? [],
      artifactStages: artifact?.stages ?? [],
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
        const job = jobs[i];
        const derived = deriveLearnState({
          sourceStatus: s.status,
          jobStatus: job?.status ?? null,
          jobStage: job?.currentStage ?? null,
          jobError: job?.lastError ?? null,
          packStatus: pack?.status ?? null,
        });
        return {
          id: s.id,
          kind: s.kind, // youtube | manual_transcript | notebooklm_summary (provenance rozeti)
          title: s.title,
          channelTitle: s.channelTitle,
          url: s.url,
          status: s.status,
          userState: derived.state, // 4C-E kanonik durum
          userStateLabel: derived.label,
          canAdvance: derived.canAdvance,
          durationSec: s.durationSec,
          createdAt: s.createdAt,
          packId: pack?.id ?? null,
          packStatus: pack?.status ?? null,
          masteryScore: pack?.masteryScore ?? 0,
          category: pack?.category ?? "diger",
          jobId: job?.id ?? null,
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
