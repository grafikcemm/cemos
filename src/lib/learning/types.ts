/**
 * CemOS Learn — domain tipleri + her AI aşama çıktısı için Zod şeması.
 *
 * KRİTİK: openrouter.ts LLM çıktısını Zod ile DOĞRULAMAZ (sadece JSON.parse + cast).
 * Bu modül o boşluğu kapatır: her stage çıktısı burada safeParse edilir, başarısız
 * olursa repair pass denenir (orchestrator). growth-engine/types.ts deseni.
 */

import { z } from "zod";

/** Sabit kategori listesi (slug ASCII — enum/dosya güvenli; etiket Türkçe gösterim). */
export const LEARN_CATEGORIES = [
  "yapay_zeka",
  "kisisel_gelisim",
  "teknoloji",
  "tasarim",
  "is_finans",
  "pazarlama",
  "saglik_psikoloji",
  "egitim",
  "bilim",
  "diger",
] as const;
export type LearnCategory = (typeof LEARN_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<LearnCategory, string> = {
  yapay_zeka: "Yapay Zeka",
  kisisel_gelisim: "Kişisel Gelişim",
  teknoloji: "Teknoloji",
  tasarim: "Tasarım",
  is_finans: "İş & Finans",
  pazarlama: "Pazarlama",
  saglik_psikoloji: "Sağlık & Psikoloji",
  egitim: "Eğitim",
  bilim: "Bilim",
  diger: "Diğer",
};

export function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[(slug as LearnCategory)] ?? "Diğer";
}

export type GroundingType =
  | "source_supported" // transkriptte AÇIKÇA var (transcript basis)
  | "summary_supported" // NotebookLM özetinde var — orijinal videoda DOĞRULANMADI (summary basis)
  | "external_context"
  | "inference"
  | "uncertain";

export const GroundingTypeSchema = z.enum([
  "source_supported",
  "summary_supported",
  "external_context",
  "inference",
  "uncertain",
]);

/**
 * Kaynak temeli (4C-A). transcript = gerçek/manuel transkript (source_supported meşru).
 * summary = NotebookLM özeti (yalnız summary_supported meşru; source_supported = yalan iddia).
 * kind'den türetilir → ayrı kolon gerekmez.
 */
export type SourceBasis = "transcript" | "summary";

export function basisForKind(kind: string): SourceBasis {
  return kind === "notebooklm_summary" ? "summary" : "transcript";
}

/** Bu basis için "materyalde geçiyor" anlamına gelen tek meşru grounded tür. */
export function groundedTypeForBasis(basis: SourceBasis): GroundingType {
  return basis === "summary" ? "summary_supported" : "source_supported";
}

// ── content_analysis: section özeti (map adımı) ──
export const SectionAnalysisSchema = z.object({
  sectionSummary: z.string().min(1),
  keyPoints: z
    .array(
      z.object({
        text: z.string().min(1),
        chunkIdx: z.number().int().min(0),
      })
    )
    .default([]),
});
export type SectionAnalysis = z.infer<typeof SectionAnalysisSchema>;

// ── content_analysis: global sentez (reduce adımı) → 3-seviye özet + iddialar ──
export const GlobalSynthesisSchema = z.object({
  summaryL1: z.string().min(1), // tek cümle / 30sn
  summaryL2: z.string().min(1), // yönetici özeti
  summaryL3: z.string().min(1), // bölüm bölüm
  category: z.enum(LEARN_CATEGORIES).default("diger"), // videonun ana kategorisi
  claims: z
    .array(
      z.object({
        text: z.string().min(1),
        chunkIdx: z.number().int().min(0),
        groundingType: GroundingTypeSchema.default("source_supported"),
      })
    )
    .default([]),
});
export type GlobalSynthesis = z.infer<typeof GlobalSynthesisSchema>;

// ── concepts ──
export const ConceptsSchema = z.object({
  concepts: z
    .array(
      z.object({
        label: z.string().min(1),
        definition: z.string().default(""),
        importance: z.number().int().min(0).max(100).default(50),
        groundingChunks: z.array(z.number().int().min(0)).default([]),
      })
    )
    .min(1),
});
export type ConceptsOutput = z.infer<typeof ConceptsSchema>;

// ── assessment: flashcard + quiz ──
const FlashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  conceptLabel: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).default(2),
  chunkIdx: z.number().int().min(0),
  groundingType: GroundingTypeSchema.default("source_supported"),
});

const QuizSchema = z.object({
  stem: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctIdx: z.number().int().min(0),
  rationale: z.string().default(""),
  conceptLabel: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).default(2),
  chunkIdx: z.number().int().min(0),
  groundingType: GroundingTypeSchema.default("source_supported"),
});

export const AssessmentSchema = z
  .object({
    flashcards: z.array(FlashcardSchema).default([]),
    quizzes: z.array(QuizSchema).default([]),
  })
  .refine((d) => d.flashcards.length + d.quizzes.length > 0, {
    message: "en az bir flashcard veya quiz gerekli",
  });
export type AssessmentOutput = z.infer<typeof AssessmentSchema>;
export type FlashcardOutput = z.infer<typeof FlashcardSchema>;
export type QuizOutput = z.infer<typeof QuizSchema>;

// ── qa: grounding doğrulama kapısı ──
export const QaReportSchema = z.object({
  coverage: z.number().min(0).max(1), // source_supported iddia oranı
  verdict: z.enum(["pass", "review", "fail"]),
  flagged: z
    .array(z.object({ claim: z.string(), reason: z.string() }))
    .default([]),
});
export type QaReport = z.infer<typeof QaReportSchema>;

// ── notes: atomik notlar (4C-D) — tek fikir + grounding ──
export const AtomicNoteSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  chunkIdxs: z.array(z.number().int().min(0)).default([]),
  groundingType: GroundingTypeSchema.default("source_supported"),
  relatedConceptLabels: z.array(z.string().min(1)).default([]),
});
export const NotesSchema = z
  .object({ atomicNotes: z.array(AtomicNoteSchema).default([]) })
  .refine((d) => d.atomicNotes.length > 0, { message: "en az bir atomik not gerekli" });
export type NotesOutput = z.infer<typeof NotesSchema>;
export type AtomicNoteOutput = z.infer<typeof AtomicNoteSchema>;

// ── graph: kavram ilişkileri (4C-D) — node'lar concept/note'tan türer, edge'ler burada.
// Edge'ler label ile referans verir (model id bilmez); orchestrator id'lere çözer. ──
export const GraphEdgeSchema = z.object({
  sourceLabel: z.string().min(1),
  targetLabel: z.string().min(1),
  relation: z.string().min(1), // ilişki etiketi (ör. "önkoşul", "örnek", "karşıt")
  groundingType: GroundingTypeSchema.default("inference"),
});
export const GraphSchema = z.object({ edges: z.array(GraphEdgeSchema).default([]) });
export type GraphOutput = z.infer<typeof GraphSchema>;
export type GraphEdgeOutput = z.infer<typeof GraphEdgeSchema>;

// ── tasks: uygulama görevleri (4C-D) — neden + adımlar + grounding ──
export const ApplyTaskSchema = z.object({
  title: z.string().min(1),
  why: z.string().default(""),
  steps: z.array(z.string().min(1)).default([]),
  chunkIdxs: z.array(z.number().int().min(0)).default([]),
  groundingType: GroundingTypeSchema.default("inference"),
});
export const TasksSchema = z.object({ tasks: z.array(ApplyTaskSchema).default([]) });
export type TasksOutput = z.infer<typeof TasksSchema>;
export type ApplyTaskOutput = z.infer<typeof ApplyTaskSchema>;

// ── content_ideas: içerik fikirleri (4C-D) — CemOS'un YAYINLADIĞI içerik DEĞİL, öneri ──
export const ContentIdeaSchema = z.object({
  title: z.string().min(1),
  angle: z.string().default(""),
  hook: z.string().default(""),
  format: z.string().default(""), // ör. carousel | reel | thread | video
  sourceConceptLabels: z.array(z.string().min(1)).default([]),
  groundingType: GroundingTypeSchema.default("inference"),
});
export const ContentIdeasSchema = z.object({
  contentIdeas: z.array(ContentIdeaSchema).default([]),
});
export type ContentIdeasOutput = z.infer<typeof ContentIdeasSchema>;
export type ContentIdeaOutput = z.infer<typeof ContentIdeaSchema>;
