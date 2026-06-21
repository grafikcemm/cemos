/**
 * CemOS Learn — LLM aşama fonksiyonları. Her biri runValidatedStage ile Zod-doğrulu
 * çalışır; persist ETMEZ (orchestrator yazar) → test edilebilir, saf-ish. Roller
 * learnConfig.STAGE_ROLES'tan; cheap section map → güçlü global reduce.
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
  type ChunkRef,
  type KeyPointRef,
} from "@/lib/learning/prompts";
import {
  SectionAnalysisSchema,
  GlobalSynthesisSchema,
  ConceptsSchema,
  AssessmentSchema,
  type SectionAnalysis,
  type GlobalSynthesis,
  type ConceptsOutput,
  type AssessmentOutput,
} from "@/lib/learning/types";

function role(name: keyof typeof STAGE_ROLES, fallback: ModelRole): ModelRole {
  return STAGE_ROLES[name] ?? fallback;
}

/** content_analysis — map: bir section'ı özetle (ucuz model). */
export function runSectionAnalysis(
  trace: PipelineTraceCollector,
  spend: SpendFn,
  sectionChunks: readonly ChunkRef[],
  sectionIdx: number
): Promise<{ data: SectionAnalysis; model: string }> {
  const { system, user } = buildSectionAnalysis(sectionChunks);
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
  }
): Promise<{ data: GlobalSynthesis; model: string }> {
  const { system, user } = buildGlobalSynthesis(input);
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
  input: { summaryL2: string; keyPoints: KeyPointRef[] }
): Promise<{ data: ConceptsOutput; model: string }> {
  const { system, user } = buildConcepts(input);
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
    concepts: { label: string; definition: string }[];
    keyPoints: KeyPointRef[];
  }
): Promise<{ data: AssessmentOutput; model: string }> {
  const { system, user } = buildAssessment(input);
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
