/**
 * CemOS Learn — resumable pipeline motoru. advanceJob() bir job'ı deadline'a kadar
 * aşama aşama ilerletir; her aşamadan sonra persist eder (idempotent + resume).
 * content_analysis map-reduce kısmi ilerleme (stageStateJson) ile 300s'i aşmaz.
 * Bütçe gate LLM aşamalarından önce. Tek-aşama-fail tüm job'ı baştan başlatmaz.
 */

import { createPipelineTrace } from "@/lib/agents/pipeline-runner";
import { usageService } from "@/lib/services/usageService";
import { BudgetExceededError } from "@/lib/config/costGate";
import { safeJsonParse, safeJsonStringify } from "@/lib/growth-engine/types";
import { learnSourceRepo } from "@/lib/db/learnSourceRepo";
import { learnTranscriptRepo } from "@/lib/db/learnTranscriptRepo";
import { learnPackRepo, type ItemInput } from "@/lib/db/learnPackRepo";
import { learnJobRepo } from "@/lib/db/learnJobRepo";
import { learnReviewRepo } from "@/lib/db/learnReviewRepo";
import {
  LEARN_PURPOSE,
  PIPELINE_VERSION,
  PROMPT_VERSION,
  MIN_TRANSCRIPT_CHARS,
  MAX_STAGE_ATTEMPTS,
  REVIEW_LADDER_DAYS,
  STALE_LEASE_MS,
  getLearnMonthlyBudgetUsd,
  isGeminiConfigured,
  isSupadataConfigured,
  isObsidianAutoExportEnabled,
  getTranscriptCostUsd,
  getGeminiTranscriptModel,
} from "@/lib/learning/learnConfig";
import { nextStage, PASSTHROUGH_STAGES, type LearnStage } from "./stages";
import { fetchVideoMetadata, fetchTimedTranscript, type TimedSegment } from "./transcript-fetch";
import { fetchTranscriptViaGemini } from "@/lib/learning/gemini";
import { fetchTranscriptViaSupadata } from "@/lib/learning/supadata";
import { exportPackToChannel } from "@/lib/learning/exportService";
import { chunkSegments, plainTextSegments } from "./chunk";
import {
  runSectionAnalysis,
  runGlobalSynthesis,
  runConcepts,
  runAssessment,
  runNotes,
  runGraph,
  runTasks,
  runContentIdeas,
} from "./stages-ai";
import { computeQaReport, packStatusForVerdict, type ClaimLike, type ItemLike } from "./qa";
import { basisForKind, type GroundingType, type SourceBasis } from "@/lib/learning/types";
import {
  artifactOrEmpty,
  serializeArtifact,
  withNotes,
  withGraph,
  withTasks,
  withContentIdeas,
  type ArtifactNode,
  type ArtifactEdge,
} from "@/lib/learning/artifact";
import type { SpendFn } from "./run-llm";

export class TranscriptUnavailableError extends Error {
  readonly code = "transcript_unavailable";
  constructor() {
    super("Bu video için transkript bulunamadı. Manuel transkript ekleyebilirsiniz.");
    this.name = "TranscriptUnavailableError";
  }
}

type StageKeyPoint = { text: string; chunkIdx: number };
type StageSection = { sectionSummary: string; keyPoints: StageKeyPoint[] };
type StageState = {
  packId?: string;
  sections?: StageSection[];
  keyPoints?: StageKeyPoint[];
  claims?: { text: string; chunkIdx: number; groundingType: GroundingType }[];
};

export type AdvanceResult = {
  jobId: string;
  currentStage: LearnStage;
  status: string;
  packId: string | null;
  error: string | null;
};

const STAY = "STAY" as const;
type DispatchResult = LearnStage | typeof STAY;

function groupSections(
  chunks: { idx: number; startSec: number; text: string; sectionIdx: number }[]
) {
  const map = new Map<number, { idx: number; startSec: number; text: string }[]>();
  for (const c of chunks) {
    const arr = map.get(c.sectionIdx) ?? [];
    arr.push({ idx: c.idx, startSec: c.startSec, text: c.text });
    map.set(c.sectionIdx, arr);
  }
  return [...map.keys()].sort((a, b) => a - b).map((k) => map.get(k)!);
}

/**
 * Bir job'ı deadline'a kadar ilerletir. Lease: status="running" + heartbeatAt.
 * Bütçe aşımı (BudgetExceededError) ve transkript-yok (TranscriptUnavailableError)
 * job'ı uygun şekilde durdurur; diğer hatalar sınırlı retry sonra fail.
 */
export async function advanceJob(
  jobId: string,
  opts: { deadlineMs: number }
): Promise<AdvanceResult> {
  const t0 = Date.now();
  const job0 = await learnJobRepo.getById(jobId);
  if (!job0) throw new Error("job_not_found");

  if (job0.status === "done" || job0.currentStage === "completed") {
    return { jobId, currentStage: "completed", status: "done", packId: null, error: null };
  }

  // Atomik lease: yalnız sahipsiz/bayat job claim edilir. Aksi → taze running başka
  // worker'da; bu advance no-op döner (çift-işleme yok).
  const staleBefore = new Date(Date.now() - STALE_LEASE_MS);
  const claimed = await learnJobRepo.claim(jobId, staleBefore, job0.startedAt ?? new Date());
  if (claimed === 0) {
    return {
      jobId,
      currentStage: job0.currentStage as LearnStage,
      status: job0.status,
      packId: safeJsonParse<{ packId?: string }>(job0.stageStateJson, {}).packId ?? null,
      error: job0.lastError,
    };
  }

  // Claim sonrası taze oku (currentStage/stageStateJson/attempts güncel).
  const job = (await learnJobRepo.getById(jobId)) ?? job0;
  const sourceId = job.sourceId;
  const source = await learnSourceRepo.getById(sourceId);
  if (!source) throw new Error("source_not_found");
  const basis: SourceBasis = basisForKind(source.kind); // transcript | summary (NotebookLM)
  if (source.status === "new") await learnSourceRepo.update(sourceId, { status: "processing" });

  const state: StageState = safeJsonParse<StageState>(job.stageStateJson, {});
  let currentStage = job.currentStage as LearnStage;
  // failed job'a tekrar advance = kullanıcı/elle "bu adımdan devam et" → sayaç sıfırlanır.
  // (cron sweep failed job'ları seçmez; failed yalnız manuel retry ile ilerler.)
  let attempts = job.status === "failed" ? 0 : job.attempts;

  // Bu advance'in trace + harcaması.
  let advanceCost = 0;
  const trace = createPipelineTrace({
    platform: "learn",
    pipelineId: LEARN_PURPOSE,
    subjectType: "learn_pack",
    subjectId: state.packId ?? sourceId,
  });
  // Dalga 2 (Sprint 2): runStage artık gated — UsageLog'u (purpose=pipelineId,
  // platform=learn) KENDİSİ yazar. Burada tekrar recordOpenRouter çağırmak
  // çift-log olurdu; yalnız pack maliyet sayacı toplanır.
  const spend: SpendFn = async (r) => {
    advanceCost += r.actualCostUsd;
  };

  const persistState = () =>
    learnJobRepo.update(jobId, { stageStateJson: safeJsonStringify(state) });

  const finish = async (status: string, error: string | null): Promise<AdvanceResult> => {
    if (advanceCost > 0 && state.packId) {
      const pack = await learnPackRepo.getById(state.packId);
      if (pack) await learnPackRepo.update(state.packId, { costUsd: pack.costUsd + advanceCost });
    }
    await trace.flush(advanceCost);
    await learnJobRepo.update(jobId, {
      status,
      attempts,
      currentStage,
      lastError: error,
      heartbeatAt: status === "running" ? new Date() : null,
      finishedAt: status === "done" || status === "failed" ? new Date() : null,
    });
    return { jobId, currentStage, status, packId: state.packId ?? null, error };
  };

  // ── Aşama döngüsü ──
  while (currentStage !== "completed") {
    if (Date.now() - t0 > opts.deadlineMs) {
      return finish("pending", null); // süre doldu, sonraki advance devam eder
    }
    try {
      const result = await dispatch(currentStage);
      if (result === STAY) {
        return finish("pending", null); // content_analysis kısmi: aynı aşamada bekle
      }
      currentStage = result;
      attempts = 0;
      await learnJobRepo.update(jobId, {
        currentStage,
        attempts: 0,
        lastError: null,
        heartbeatAt: new Date(),
      });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        await finish("pending", "budget");
        throw err; // route 429 döner; job aynı aşamada bekler
      }
      if (err instanceof TranscriptUnavailableError) {
        await learnSourceRepo.update(sourceId, { status: "failed" });
        await finish("failed", err.code);
        throw err;
      }
      attempts += 1;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_STAGE_ATTEMPTS) {
        await learnSourceRepo.update(sourceId, { status: "failed" });
        return finish("failed", msg);
      }
      return finish("pending", msg); // sınırlı retry: sonraki advance aynı aşamayı dener
    }
  }

  await learnSourceRepo.update(sourceId, { status: "ready" });
  return finish("done", null);

  // ───────────────────────── stage dispatch ─────────────────────────
  async function dispatch(stage: LearnStage): Promise<DispatchResult> {
    if (PASSTHROUGH_STAGES.has(stage)) return nextStage(stage)!; // v2 no-op

    switch (stage) {
      case "source_created":
        return nextStage(stage)!;

      case "metadata": {
        // Yalnız YouTube kaynağının video metadatası çekilir; manuel/NotebookLM'de
        // externalId bir video değil (SHA-256) → fetch anlamsız, atla.
        if (source!.kind === "youtube") {
          const meta = await fetchVideoMetadata(source!.externalId);
          if (meta) {
            await learnSourceRepo.update(sourceId, {
              title: source!.title || meta.title,
              channelTitle: source!.channelTitle || meta.channelTitle,
              durationSec: source!.durationSec || meta.durationSec,
            });
          }
        }
        return nextStage(stage)!;
      }

      case "transcript": {
        await ensureTranscript();
        return nextStage(stage)!;
      }

      case "validate": {
        // Transkript yoksa son bir kez daha dene (youtubei + Gemini) — eski kodla
        // validate'te takılan job'lar da yeni Gemini yolundan faydalanır. Hâlâ yoksa dur.
        if (!(await ensureTranscript())) {
          throw new TranscriptUnavailableError();
        }
        return nextStage(stage)!;
      }

      case "chunk": {
        const tr = await learnTranscriptRepo.getBySource(sourceId);
        if (!tr) throw new TranscriptUnavailableError();
        // Zaman-kodlu segment varsa onu kullan; yoksa (manuel/NotebookLM) düz metni
        // pseudo-segment'e böl → chunk boş kalmaz (aksi halde 0 chunk = bozuk pack).
        let segments = safeJsonParse<TimedSegment[]>(tr.segmentsJson, []);
        if (segments.length === 0) segments = plainTextSegments(tr.fullText);
        const chunks = chunkSegments(segments);
        await learnTranscriptRepo.replaceChunks(sourceId, tr.id, chunks);
        return nextStage(stage)!;
      }

      case "content_analysis":
        return runContentAnalysis();

      case "concepts":
        return runConceptsStage();

      case "notes":
        return runNotesStage();

      case "graph":
        return runGraphStage();

      case "assessment":
        return runAssessmentStage();

      case "tasks":
        return runTasksStage();

      case "content_ideas":
        return runContentIdeasStage();

      case "qa":
        return runQaStage();

      case "review_schedule":
        return runReviewScheduleStage();

      case "integration_suggestions": {
        // Obsidian OTOMATİK aktarım YALNIZ OBSIDIAN_AUTO_EXPORT=true iken (örtük dış
        // yazma YOK — kapalıyken bundle yalnız API/UI talebiyle hazırlanır). Açıkken
        // bile: exportPackToChannel yalnız ready pack + configured kanalı yazar ve her
        // denemeyi LearnExportAttempt'e kaydeder. Export hatası bu aşamayı BOZMAZ
        // (fail-soft); "aşama tamamlandı" ASLA "export başarılı" demez — gerçek durum
        // attempt contract'ından okunur.
        if (state.packId && isObsidianAutoExportEnabled()) {
          await exportPackToChannel(state.packId, "local_vault").catch(() => {});
          await exportPackToChannel(state.packId, "github_vault").catch(() => {});
        }
        return nextStage(stage)!;
      }

      default:
        return nextStage(stage)!;
    }
  }

  async function assertBudget(): Promise<void> {
    const spent = await usageService.getMonthlySpendByPurpose("learn_");
    const budget = getLearnMonthlyBudgetUsd();
    if (spent >= budget) throw new BudgetExceededError(spent, budget);
  }

  // Transkripti garanti et: mevcut yeterliyse true; değilse youtubei (altyazı) →
  // Gemini native video (kilit olsa bile izler) sırayla dener, yazar. Hiçbiri
  // yetmezse false. transcript + validate aşamaları bunu çağırır (idempotent).
  async function ensureTranscript(): Promise<boolean> {
    const existing = await learnTranscriptRepo.getBySource(sourceId);
    if (existing && existing.fullText.length >= MIN_TRANSCRIPT_CHARS) return true;
    let tr = await fetchTimedTranscript(source!.externalId);
    // Free youtubei captions come first. The next two providers COST money, so the
    // learn budget must gate them (previously the only paid path with NO ceiling)
    // and the spend must be logged (previously silently $0). assertBudget throws
    // BudgetExceededError → the stage stops honestly when the learn budget is spent.
    if (!tr && (isSupadataConfigured() || isGeminiConfigured())) await assertBudget();
    if (!tr && isSupadataConfigured()) tr = await fetchTranscriptViaSupadata(source!.externalId);
    if (!tr && isGeminiConfigured()) tr = await fetchTranscriptViaGemini(source!.url);
    if (tr && tr.fullText.length >= MIN_TRANSCRIPT_CHARS) {
      await learnTranscriptRepo.upsert({
        sourceId,
        provider: tr.provider,
        lang: tr.lang,
        segmentsJson: safeJsonStringify(tr.segments),
        fullText: tr.fullText,
      });
      // Account the PAID transcript providers (gemini / supadata). Best-effort: a
      // ledger write must never lose a transcript we already fetched + stored.
      const cost = getTranscriptCostUsd(tr.provider);
      if (cost > 0) {
        await usageService
          .recordTranscript({
            provider: tr.provider,
            estimatedCostUsd: cost,
            model: tr.provider === "gemini" ? getGeminiTranscriptModel() : undefined,
            meta: { purpose: "learn_transcript", sourceId },
          })
          .catch(() => {});
      }
      return true;
    }
    return false;
  }

  async function ensurePack(): Promise<string> {
    if (state.packId) return state.packId;
    const pack = await learnPackRepo.upsertDraft({
      sourceId,
      pipelineVersion: PIPELINE_VERSION,
      promptVersion: PROMPT_VERSION,
    });
    state.packId = pack.id;
    await persistState();
    return pack.id;
  }

  // content_analysis: section map (kısmi-persist) → global reduce.
  async function runContentAnalysis(): Promise<DispatchResult> {
    await assertBudget();
    const packId = await ensurePack();
    const chunks = await learnTranscriptRepo.listChunks(sourceId);
    const sections = groupSections(chunks);
    state.sections = state.sections ?? [];

    for (let si = state.sections.length; si < sections.length; si++) {
      if (Date.now() - t0 > opts.deadlineMs) return STAY; // kısmi: kaldığı section'dan devam
      const { data } = await runSectionAnalysis(trace, spend, sections[si], si, basis);
      state.sections.push({ sectionSummary: data.sectionSummary, keyPoints: data.keyPoints });
      await persistState();
    }

    if (Date.now() - t0 > opts.deadlineMs) return STAY;
    const { data: global, model } = await runGlobalSynthesis(
      trace,
      spend,
      {
        title: source!.title,
        channelTitle: source!.channelTitle,
        sections: state.sections,
      },
      basis
    );
    state.keyPoints = state.sections.flatMap((s) => s.keyPoints);
    state.claims = global.claims;
    await learnPackRepo.update(packId, {
      summaryL1: global.summaryL1,
      summaryL2: global.summaryL2,
      summaryL3: global.summaryL3,
      category: global.category,
      modelUsed: model,
    });
    await persistState();
    return nextStage("content_analysis")!;
  }

  async function runConceptsStage(): Promise<DispatchResult> {
    await assertBudget();
    const packId = await ensurePack();
    const pack = await learnPackRepo.getById(packId);
    const { data } = await runConcepts(
      trace,
      spend,
      {
        summaryL2: pack?.summaryL2 ?? "",
        keyPoints: state.keyPoints ?? [],
      },
      basis
    );
    await learnPackRepo.replaceConcepts(
      packId,
      data.concepts.map((c) => ({
        label: c.label,
        definition: c.definition,
        importance: c.importance,
        groundingJson: safeJsonStringify(c.groundingChunks.map((chunkIdx) => ({ chunkIdx }))),
      }))
    );
    return nextStage("concepts")!;
  }

  // notes: atomik notlar → v2 artifact zarfı (notesJson). stages'te varsa çift-ücret YOK
  // (LLM başarılı ama advance düşmüşse retry re-charge etmez).
  async function runNotesStage(): Promise<DispatchResult> {
    await assertBudget();
    const packId = await ensurePack();
    const pack = await learnPackRepo.getById(packId);
    const artifact = artifactOrEmpty(pack?.notesJson ?? "[]", basis);
    if (artifact.stages.includes("notes")) return nextStage("notes")!;
    const concepts = await learnPackRepo.listConcepts(packId);
    const { data } = await runNotes(
      trace,
      spend,
      {
        summaryL2: pack?.summaryL2 ?? "",
        keyPoints: state.keyPoints ?? [],
        concepts: concepts.map((c) => ({ label: c.label, definition: c.definition })),
      },
      basis
    );
    const next = withNotes(
      artifact,
      data.atomicNotes.map((n) => ({
        title: n.title,
        body: n.body,
        tags: n.tags,
        chunkIdxs: n.chunkIdxs,
        groundingType: n.groundingType,
        relatedConceptLabels: n.relatedConceptLabels,
      }))
    );
    await learnPackRepo.update(packId, { notesJson: serializeArtifact(next) });
    return nextStage("notes")!;
  }

  // graph: kavram + not node'ları + AI ilişki edge'leri (label→id çözümü; dangling/self atlanır).
  async function runGraphStage(): Promise<DispatchResult> {
    await assertBudget();
    const packId = await ensurePack();
    const pack = await learnPackRepo.getById(packId);
    const artifact = artifactOrEmpty(pack?.notesJson ?? "[]", basis);
    if (artifact.stages.includes("graph")) return nextStage("graph")!;
    const concepts = await learnPackRepo.listConcepts(packId);
    const nodes: ArtifactNode[] = [
      ...concepts.map((c) => ({ id: c.id, label: c.label, kind: "concept" as const })),
      ...artifact.atomicNotes.map((n) => ({ id: n.id, label: n.title, kind: "note" as const })),
    ];
    const labelToId = new Map<string, string>();
    for (const n of nodes) labelToId.set(n.label.trim().toLowerCase(), n.id);
    const { data } = await runGraph(
      trace,
      spend,
      {
        concepts: concepts.map((c) => ({ label: c.label, definition: c.definition })),
        noteTitles: artifact.atomicNotes.map((n) => n.title),
      },
      basis
    );
    const seen = new Set<string>();
    const edges: ArtifactEdge[] = [];
    for (const e of data.edges) {
      const s = labelToId.get(e.sourceLabel.trim().toLowerCase());
      const t = labelToId.get(e.targetLabel.trim().toLowerCase());
      if (!s || !t || s === t) continue; // olmayan etiket / kendine-döngü atla
      const key = `${s}|${t}|${e.relation}`;
      if (seen.has(key)) continue; // duplicate edge atla
      seen.add(key);
      edges.push({ source: s, target: t, relation: e.relation, groundingType: e.groundingType });
    }
    const next = withGraph(artifact, { nodes, edges });
    await learnPackRepo.update(packId, { notesJson: serializeArtifact(next) });
    return nextStage("graph")!;
  }

  // tasks: uygulama görevleri → artifact.
  async function runTasksStage(): Promise<DispatchResult> {
    await assertBudget();
    const packId = await ensurePack();
    const pack = await learnPackRepo.getById(packId);
    const artifact = artifactOrEmpty(pack?.notesJson ?? "[]", basis);
    if (artifact.stages.includes("tasks")) return nextStage("tasks")!;
    const concepts = await learnPackRepo.listConcepts(packId);
    const { data } = await runTasks(
      trace,
      spend,
      {
        summaryL2: pack?.summaryL2 ?? "",
        concepts: concepts.map((c) => ({ label: c.label, definition: c.definition })),
        keyPoints: state.keyPoints ?? [],
      },
      basis
    );
    const next = withTasks(
      artifact,
      data.tasks.map((t) => ({
        title: t.title,
        why: t.why,
        steps: t.steps,
        chunkIdxs: t.chunkIdxs,
        groundingType: t.groundingType,
      }))
    );
    await learnPackRepo.update(packId, { notesJson: serializeArtifact(next) });
    return nextStage("tasks")!;
  }

  // content_ideas: içerik fikirleri → artifact. Yayınlanmış içerik DEĞİL (öneri).
  async function runContentIdeasStage(): Promise<DispatchResult> {
    await assertBudget();
    const packId = await ensurePack();
    const pack = await learnPackRepo.getById(packId);
    const artifact = artifactOrEmpty(pack?.notesJson ?? "[]", basis);
    if (artifact.stages.includes("content_ideas")) return nextStage("content_ideas")!;
    const concepts = await learnPackRepo.listConcepts(packId);
    const { data } = await runContentIdeas(
      trace,
      spend,
      {
        summaryL1: pack?.summaryL1 ?? "",
        concepts: concepts.map((c) => ({ label: c.label, definition: c.definition })),
        category: pack?.category ?? "diger",
      },
      basis
    );
    const next = withContentIdeas(
      artifact,
      data.contentIdeas.map((c) => ({
        title: c.title,
        angle: c.angle,
        hook: c.hook,
        format: c.format,
        sourceConceptLabels: c.sourceConceptLabels,
        groundingType: c.groundingType,
      }))
    );
    await learnPackRepo.update(packId, { notesJson: serializeArtifact(next) });
    return nextStage("content_ideas")!;
  }

  async function runAssessmentStage(): Promise<DispatchResult> {
    await assertBudget();
    const packId = await ensurePack();
    const concepts = await learnPackRepo.listConcepts(packId);
    const labelToId = new Map(concepts.map((c) => [c.label.toLowerCase(), c.id]));
    const { data } = await runAssessment(
      trace,
      spend,
      {
        concepts: concepts.map((c) => ({ label: c.label, definition: c.definition })),
        keyPoints: state.keyPoints ?? [],
      },
      basis
    );

    const items: ItemInput[] = [];
    for (const f of data.flashcards) {
      items.push({
        conceptId: f.conceptLabel ? labelToId.get(f.conceptLabel.toLowerCase()) ?? null : null,
        kind: "flashcard",
        front: f.front,
        back: f.back,
        optionsJson: "[]",
        correctIdx: null,
        difficulty: f.difficulty,
        groundingType: f.groundingType,
        groundingJson: safeJsonStringify([{ chunkIdx: f.chunkIdx }]),
      });
    }
    for (const q of data.quizzes) {
      const correctIdx = q.correctIdx >= 0 && q.correctIdx < q.options.length ? q.correctIdx : 0;
      items.push({
        conceptId: q.conceptLabel ? labelToId.get(q.conceptLabel.toLowerCase()) ?? null : null,
        kind: "quiz_mcq",
        front: q.stem,
        back: q.rationale,
        optionsJson: safeJsonStringify(q.options),
        correctIdx,
        difficulty: q.difficulty,
        groundingType: q.groundingType,
        groundingJson: safeJsonStringify([{ chunkIdx: q.chunkIdx }]),
      });
    }
    await learnPackRepo.replaceItems(packId, items);
    return nextStage("assessment")!;
  }

  // qa: deterministik grounding doğrulama → pack status.
  async function runQaStage(): Promise<DispatchResult> {
    const packId = await ensurePack();
    const chunkCount = await learnTranscriptRepo.countChunks(sourceId);
    const items = await learnPackRepo.listItems(packId);
    const pack = await learnPackRepo.getById(packId);
    const artifact = artifactOrEmpty(pack?.notesJson ?? "[]", basis);
    const claims: ClaimLike[] = (state.claims ?? []).map((c) => ({
      text: c.text,
      chunkIdx: c.chunkIdx,
      groundingType: c.groundingType,
    }));
    const itemLikes: ItemLike[] = items.map((it) => {
      const g = safeJsonParse<{ chunkIdx: number }[]>(it.groundingJson, []);
      return {
        front: it.front,
        chunkIdx: g[0]?.chunkIdx ?? -1,
        groundingType: it.groundingType as GroundingType,
      };
    });
    // Artifact notları + görevleri de grounding doğrulamasına girer (chunkIdx menzil kontrolü,
    // yanlış-basis grounded iddia flag'i). İçerik fikirleri = inference → doğrulama dışı.
    const artifactItems: ItemLike[] = [
      ...artifact.atomicNotes.map((n) => ({
        front: n.title,
        chunkIdx: n.chunkIdxs[0] ?? -1,
        groundingType: n.groundingType,
      })),
      ...artifact.tasks.map((t) => ({
        front: t.title,
        chunkIdx: t.chunkIdxs[0] ?? -1,
        groundingType: t.groundingType,
      })),
    ];
    const report = computeQaReport({
      claims,
      items: [...itemLikes, ...artifactItems],
      chunkCount,
      basis,
    });
    await learnPackRepo.update(packId, {
      qaReportJson: safeJsonStringify(report),
      status: packStatusForVerdict(report.verdict),
    });
    return nextStage("qa")!;
  }

  // review_schedule: YALNIZ QA'dan geçmiş (ready) pack'lerin item'larına program açılır.
  // qa_pending/qa_failed pack'ler review'a girmez → grounding garantisi korunur.
  async function runReviewScheduleStage(): Promise<DispatchResult> {
    const packId = await ensurePack();
    const pack = await learnPackRepo.getById(packId);
    if (pack?.status === "ready") {
      const firstInterval = REVIEW_LADDER_DAYS[0] ?? 1;
      await learnReviewRepo.seedForPack(packId, new Date(), firstInterval); // bugün due → hemen test edilebilir
    }
    return nextStage("review_schedule")!;
  }
}
