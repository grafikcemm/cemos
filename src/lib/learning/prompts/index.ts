/**
 * CemOS Learn — versiyonlu prompt builder'ları (saf fonksiyon, UI'a gömülmez).
 * Hepsi GROUNDING-katı: model her iddiaya transkript chunkIdx çapası koymalı,
 * transkript dışı bilgiyi 'source_supported' saymamalı. Türkçe çıktı.
 */

import { formatTimestamp } from "@/lib/learning/pipeline/chunk";

export type PromptPair = { system: string; user: string };

export type ChunkRef = { idx: number; startSec: number; text: string };
export type KeyPointRef = { text: string; chunkIdx: number };

/** "[#idx t=mm:ss] metin" blokları — model chunkIdx ile çapa kurar. */
export function formatChunks(chunks: readonly ChunkRef[]): string {
  return chunks
    .map((c) => `[#${c.idx} t=${formatTimestamp(c.startSec)}] ${c.text}`)
    .join("\n");
}

const GROUNDING_RULE =
  "KURAL: Her önemli bilgi için onu DESTEKLEYEN chunk numarasını (chunkIdx) belirt. " +
  "Transkriptte AÇIKÇA olmayan bilgiyi 'source_supported' olarak işaretleme. " +
  "Senin eklediğin arka plan = 'external_context', çıkarım = 'inference', emin değilsen = 'uncertain'. " +
  "Bilgi UYDURMA. SADECE geçerli JSON döndür, başka metin ekleme.";

export function buildSectionAnalysis(sectionChunks: readonly ChunkRef[]): PromptPair {
  return {
    system:
      "Sen bir öğrenme materyali analistisin. Sana eğitici bir videonun BİR BÖLÜMÜNÜN " +
      "zaman-kodlu transkript parçaları veriliyor. Bu bölümü özetle ve önemli noktaları çıkar. " +
      GROUNDING_RULE,
    user:
      `Transkript parçaları:\n${formatChunks(sectionChunks)}\n\n` +
      `JSON şeması: {"sectionSummary": "...", "keyPoints": [{"text": "...", "chunkIdx": 0}]}`,
  };
}

export function buildGlobalSynthesis(input: {
  title: string;
  channelTitle: string;
  sections: { sectionSummary: string; keyPoints: KeyPointRef[] }[];
}): PromptPair {
  const sectionsBlock = input.sections
    .map((s, i) => {
      const kp = s.keyPoints.map((k) => `  - (#${k.chunkIdx}) ${k.text}`).join("\n");
      return `Bölüm ${i + 1}: ${s.sectionSummary}\n${kp}`;
    })
    .join("\n\n");
  return {
    system:
      "Sen bir öğrenme mimarısın. Bölüm özetlerinden videonun BÜTÜNÜ için üç seviyeli özet üret: " +
      "summaryL1 (tek cümle / 30 saniye), summaryL2 (yönetici özeti), summaryL3 (bölüm bölüm). " +
      "Videoyu şu kategorilerden BİRİNE ata (category alanında slug): yapay_zeka, kisisel_gelisim, " +
      "teknoloji, tasarim, is_finans, pazarlama, saglik_psikoloji, egitim, bilim, diger. " +
      "Ayrıca videonun önemli iddialarını topla; her iddia için kaynak chunkIdx ve groundingType ver. " +
      GROUNDING_RULE,
    user:
      `Başlık: ${input.title}\nKanal: ${input.channelTitle}\n\nBölüm özetleri (chunkIdx parantez içinde):\n${sectionsBlock}\n\n` +
      `JSON şeması: {"summaryL1":"...","summaryL2":"...","summaryL3":"...","category":"yapay_zeka","claims":[{"text":"...","chunkIdx":0,"groundingType":"source_supported"}]}`,
  };
}

export function buildConcepts(input: {
  summaryL2: string;
  keyPoints: KeyPointRef[];
}): PromptPair {
  const kp = input.keyPoints.map((k) => `(#${k.chunkIdx}) ${k.text}`).join("\n");
  return {
    system:
      "Sen bir kavram çıkarıcısın. Videodaki önemli ÖĞRETİLEBİLİR kavramları çıkar (en fazla 12). " +
      "Her kavram için kısa tanım, önem (0-100) ve kavramı destekleyen chunkIdx listesi ver. " +
      GROUNDING_RULE,
    user:
      `Özet: ${input.summaryL2}\n\nÖnemli noktalar (chunkIdx parantez içinde):\n${kp}\n\n` +
      `JSON şeması: {"concepts":[{"label":"...","definition":"...","importance":50,"groundingChunks":[0,1]}]}`,
  };
}

export function buildAssessment(input: {
  concepts: { label: string; definition: string }[];
  keyPoints: KeyPointRef[];
}): PromptPair {
  const conceptBlock = input.concepts.map((c) => `- ${c.label}: ${c.definition}`).join("\n");
  const kp = input.keyPoints.map((k) => `(#${k.chunkIdx}) ${k.text}`).join("\n");
  return {
    system:
      "Sen bir değerlendirme tasarımcısısın. Verilen kavramlardan ve önemli noktalardan AKTİF HATIRLAMA " +
      "materyali üret: flashcard'lar (soru→kısa cevap) ve çoktan seçmeli quiz'ler. " +
      "Quiz distractor'ları (yanlış şıklar) videodaki yakın kavramlardan türetilmeli ama net yanlış olmalı; " +
      "rastgele/anlamsız olmamalı. Her item kaynak chunkIdx taşımalı. " +
      GROUNDING_RULE,
    user:
      `Kavramlar:\n${conceptBlock}\n\nÖnemli noktalar (chunkIdx parantez içinde):\n${kp}\n\n` +
      `Her kavram için en az 1 flashcard, toplam en az 3 quiz üret.\n` +
      `JSON şeması: {"flashcards":[{"front":"...","back":"...","conceptLabel":"...","difficulty":2,"chunkIdx":0,"groundingType":"source_supported"}],` +
      `"quizzes":[{"stem":"...","options":["...","..."],"correctIdx":0,"rationale":"...","conceptLabel":"...","difficulty":2,"chunkIdx":0,"groundingType":"source_supported"}]}`,
  };
}
