/**
 * CemOS Learn pipeline aşama sırası. Job.currentStage bu union'dan bir değer
 * taşır; orchestrator nextStage() ile bir sonrakine ilerler.
 *
 * v2 (4C-D): notes/graph/tasks artık GERÇEK üretim aşaması (passthrough DEĞİL) +
 * content_ideas eklendi. PASSTHROUGH_STAGES boş — her aşama iş yapıyor.
 */

export const STAGE_ORDER = [
  "source_created",
  "metadata",
  "transcript",
  "validate",
  "chunk",
  "content_analysis",
  "concepts",
  "notes",
  "graph",
  "assessment",
  "tasks",
  "content_ideas",
  "qa",
  "review_schedule",
  "integration_suggestions",
  "completed",
] as const;

export type LearnStage = (typeof STAGE_ORDER)[number];

/** No-op geçilen aşamalar. v2'de BOŞ — notes/graph/tasks/content_ideas gerçek iş
 *  yapıyor (stages-ai). Guard yine de duruyor: ileride bir aşama koşullu atlanırsa. */
export const PASSTHROUGH_STAGES: ReadonlySet<LearnStage> = new Set<LearnStage>([]);

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
  content_ideas: "İçerik fikirleri üretiliyor",
  qa: "Kalite kontrolü yapılıyor",
  review_schedule: "Tekrar programı hazırlanıyor",
  integration_suggestions: "Obsidian'a aktarılıyor",
  completed: "Öğrenme paketi tamamlandı",
};
