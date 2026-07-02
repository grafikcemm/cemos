/**
 * CemOS Learn pipeline aşama sırası. Job.currentStage bu union'dan bir değer
 * taşır; orchestrator nextStage() ile bir sonrakine ilerler. Dikey dilimde
 * notes/graph/tasks/integration_suggestions aşamaları PASSTHROUGH (no-op) —
 * v2'de derinleşir; sıra korunur ki versiyon/migration kırılmasın.
 */

export const STAGE_ORDER = [
  "source_created",
  "metadata",
  "transcript",
  "validate",
  "chunk",
  "content_analysis",
  "notes",
  "concepts",
  "graph",
  "assessment",
  "tasks",
  "qa",
  "review_schedule",
  "integration_suggestions",
  "completed",
] as const;

export type LearnStage = (typeof STAGE_ORDER)[number];

/** Dikey dilimde no-op geçilen aşamalar (v2'de gerçek iş).
 *  integration_suggestions artık Obsidian otomatik yazma yapıyor (passthrough değil). */
export const PASSTHROUGH_STAGES: ReadonlySet<LearnStage> = new Set<LearnStage>([
  "notes",
  "graph",
  "tasks",
]);

export const TERMINAL_STAGE: LearnStage = "completed";

/** Bir sonraki aşama, ya da completed'tan sonra null. */
export function nextStage(stage: LearnStage): LearnStage | null {
  const i = STAGE_ORDER.indexOf(stage);
  if (i < 0 || i >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1];
}

/** 0..1 ilerleme oranı (UI stepper için). */
export function stageProgress(stage: LearnStage): number {
  const i = STAGE_ORDER.indexOf(stage);
  if (i < 0) return 0;
  return i / (STAGE_ORDER.length - 1);
}

/** Türkçe etiketler (processing stepper). */
export const STAGE_LABELS: Record<LearnStage, string> = {
  source_created: "Kaynak eklendi",
  metadata: "Video bilgileri alınıyor",
  transcript: "Transkript hazırlanıyor",
  validate: "Transkript kontrol ediliyor",
  chunk: "Bölümlere ayrılıyor",
  content_analysis: "İçerik analiz ediliyor",
  notes: "Notlar oluşturuluyor",
  concepts: "Kavramlar çıkarılıyor",
  graph: "Kavram ilişkileri kuruluyor",
  assessment: "Sorular hazırlanıyor",
  tasks: "Uygulama görevleri çıkarılıyor",
  qa: "Kalite kontrolü yapılıyor",
  review_schedule: "Tekrar programı hazırlanıyor",
  integration_suggestions: "Obsidian'a aktarılıyor",
  completed: "Öğrenme paketi tamamlandı",
};
