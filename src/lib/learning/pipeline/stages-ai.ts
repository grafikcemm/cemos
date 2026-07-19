/**
 * CemOS Learn — LLM aşama fonksiyonları. Her biri runValidatedStage ile Zod-doğrulu
 * çalışır; persist ETMEZ (orchestrator yazar) → test edilebilir, saf-ish. Roller
 * learnConfig.STAGE_ROLES'tan; cheap section map → güçlü global reduce.
 *
 * Tüm builder'lar basis alır (transcript | summary) → NotebookLM özetinde grounding
 * kuralı summary_supported'a döner (source_supported YASAK).
 */

import type { ModelRole } from "@/lib/ai/model-config";
import type { PipelineTraceCollector } from "@/lib/agents/pipeline-runner";
import { STAGE_ROLES } from "@/lib/learning/learnConfig";
import { runValidatedStage, type SpendFn } from "./run-llm";
import {
  buildSectionAnalysis,
  buildGlobalSynthesis,
  buildConcepts,
  buildAssessment,
  buildNotes,
  buildGraph,
  buildTasks,
  buildContentIdeas,
  type ChunkRef,
  type KeyPointRef,
  type ConceptRef,
} from "@/lib/learning/prompts";
import {
  SectionAnalysisSchema,
  GlobalSynthesisSchema,
  ConceptsSchema,
  AssessmentSchema,
  NotesSchema,
  GraphSchema,
  TasksSchema,
  ContentIdeasSchema,
  type SectionAnalysis,
  type GlobalSynthesis,
  type ConceptsOutput,
  type AssessmentOutput,
  type NotesOutput,
  type GraphOutput,
  type TasksOutput,
  type ContentIdeasOutput,
  type SourceBasis,
} from "@/lib/learning/types";

function role(name: keyof typeof STAGE_ROLES, fallback: ModelRole): ModelRole {
  return STAGE_ROLES[name] ?? fallback;
}

/** content_analysis — map: bir section'ı özetle (ucuz model). */
export function runSectionAnalysis(
  trace: PipelineTraceCollector,
  spend: SpendFn,
  sectionChunks: readonly ChunkRef[],
  sectionIdx: number,
  basis: SourceBasis = "transcript"
): Promise<{ data: SectionAnalysis; model: string }> {
  const { system, user } = buildSectionAnalysis(sectionChunks, basis);
  return runValidatedStage(trace, {
    stage: `section_${sectionIdx}`,
    role: role("content_analysis", "cheapWriter"),
    system,
    user,
    schema: SectionAnalysisSchema,
    temperature: 0.4,
    onSpend: spend,
  });
}

/** content_analysis — reduce: bölüm özetlerinden 3-seviye global sentez (güçlü model). */
export function runGlobalSynthesis(
  trace: PipelineTraceCollector,
  spend: SpendFn,
  input: {
    title: string;
    channelTitle: string;
    sections: { sectionSummary: string; keyPoints: KeyPointRef[] }[];
  },
  basis: SourceBasis = "transcript"
): Promise<{ data: GlobalSynthesis; model: string }> {
  const { system, user } = buildGlobalSynthesis(input, basis);
  return runValidatedStage(trace, {
    stage: "global_synthesis",
    role: "qualityJudge",
    roleFallback: ["creativeWriter"],
    system,
    user,
    schema: GlobalSynthesisSchema,
    temperature: 0.5,
    onSpend: spend,
  });
}

/** concepts — kavram çıkarımı (precision rolü). */
export function runConcepts(
  trace: PipelineTraceCollector,
  spend: SpendFn,
  input: { summaryL2: string; keyPoints: KeyPointRef[] },
  basis: SourceBasis = "transcript"
): Promise<{ data: ConceptsOutput; model: string }> {
  const { system, user } = buildConcepts(input, basis);
  return runValidatedStage(trace, {
    stage: "concepts",
    role: role("concepts", "qualityJudge"),
    system,
    user,
    schema: ConceptsSchema,
    temperature: 0.4,
    onSpend: spend,
  });
}

/** assessment — flashcard + quiz üretimi. */
export function runAssessment(
  trace: PipelineTraceCollector,
  spend: SpendFn,
  input: {
    concepts: ConceptRef[];
    keyPoints: KeyPointRef[];
  },
  basis: SourceBasis = "transcript"
): Promise<{ data: AssessmentOutput; model: string }> {
  const { system, user } = buildAssessment(input, basis);
  return runValidatedStage(trace, {
    stage: "assessment",
    role: role("assessment", "creativeWriter"),
    system,
    user,
    schema: AssessmentSchema,
    temperature: 0.8,
    onSpend: spend,
  });
}

/** notes — atomik notlar (4C-D). */
export function runNotes(
  trace: PipelineTraceCollector,
  spend: SpendFn,
  input: { summaryL2: string; keyPoints: KeyPointRef[]; concepts: ConceptRef[] },
  basis: SourceBasis = "transcript"
): Promise<{ data: NotesOutput; model: string }> {
  const { system, user } = buildNotes(input, basis);
  return runValidatedStage(trace, {
    stage: "notes",
    role: role("notes", "creativeWriter"),
    system,
    user,
    schema: NotesSchema,
    temperature: 0.5,
    onSpend: spend,
  });
}

/** graph — kavram ilişkileri (4C-D, precision rolü). */
export function runGraph(
  trace: PipelineTraceCollector,
  spend: SpendFn,
  input: { concepts: ConceptRef[]; noteTitles: string[] },
  basis: SourceBasis = "transcript"
): Promise<{ data: GraphOutput; model: string }> {
  const { system, user } = buildGraph(input, basis);
  return runValidatedStage(trace, {
    stage: "graph",
    role: role("graph", "qualityJudge"),
    system,
    user,
    schema: GraphSchema,
    temperature: 0.3,
    onSpend: spend,
  });
}

/** tasks — uygulama görevleri (4C-D). */
export function runTasks(
  trace: PipelineTraceCollector,
  spend: SpendFn,
  input: { summaryL2: string; concepts: ConceptRef[]; keyPoints: KeyPointRef[] },
  basis: SourceBasis = "transcript"
): Promise<{ data: TasksOutput; model: string }> {
  const { system, user } = buildTasks(input, basis);
  return runValidatedStage(trace, {
    stage: "tasks",
    role: role("tasks", "creativeWriter"),
    system,
    user,
    schema: TasksSchema,
    temperature: 0.6,
    onSpend: spend,
  });
}

/** content_ideas — içerik fikirleri (4C-D). */
export function runContentIdeas(
  trace: PipelineTraceCollector,
  spend: SpendFn,
  input: { summaryL1: string; concepts: ConceptRef[]; category: string },
  basis: SourceBasis = "transcript"
): Promise<{ data: ContentIdeasOutput; model: string }> {
  const { system, user } = buildContentIdeas(input, basis);
  return runValidatedStage(trace, {
    stage: "content_ideas",
    role: role("content_ideas", "creativeWriter"),
    system,
    user,
    schema: ContentIdeasSchema,
    temperature: 0.7,
    onSpend: spend,
  });
}
