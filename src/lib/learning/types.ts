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
  | "source_supported"
  | "external_context"
  | "inference"
  | "uncertain";

export const GroundingTypeSchema = z.enum([
  "source_supported",
  "external_context",
  "inference",
  "uncertain",
]);

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
