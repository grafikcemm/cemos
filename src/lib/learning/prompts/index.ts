/**
 * CemOS Learn — versiyonlu prompt builder'ları (saf fonksiyon, UI'a gömülmez).
 * Hepsi GROUNDING-katı: model her iddiaya çapa (chunkIdx) koymalı, materyal dışı
 * bilgiyi meşru grounded tür saymamalı. Türkçe çıktı.
 *
 * BASIS-farkı (4C-A): transcript → 'source_supported' meşru; summary (NotebookLM)
 * → yalnız 'summary_supported' meşru, 'source_supported' YASAK (videoda doğrulanmadı).
 */

import { formatTimestamp } from "@/lib/learning/pipeline/chunk";
import type { SourceBasis } from "@/lib/learning/types";
import { groundedTypeForBasis } from "@/lib/learning/types";
import { wrapUntrustedData, UNTRUSTED_DATA_NOTICE } from "@/lib/ai/untrustedData";

export type PromptPair = { system: string; user: string };

export type ChunkRef = { idx: number; startSec: number; text: string };
export type KeyPointRef = { text: string; chunkIdx: number };
export type ConceptRef = { label: string; definition: string };

/** "[#idx t=mm:ss] metin" blokları — model chunkIdx ile çapa kurar. */
export function formatChunks(chunks: readonly ChunkRef[]): string {
  return chunks
    .map((c) => `[#${c.idx} t=${formatTimestamp(c.startSec)}] ${c.text}`)
    .join("\n");
}

/** Grounded token: JSON şema örneklerinde gösterilecek meşru tür. */
function grounded(basis: SourceBasis): string {
  return groundedTypeForBasis(basis);
}

/** Basis'e göre grounding kuralı. summary → NotebookLM özeti uyarısı. */
export function groundingRuleFor(basis: SourceBasis): string {
  if (basis === "summary") {
    return (
      "KURAL: Bu materyal orijinal videonun bir NotebookLM ÖZETİDİR — videoyu İZLEMEDİN. " +
      "Özette AÇIKÇA geçen bilgi için groundingType='summary_supported' kullan ve destekleyen chunkIdx belirt. " +
      "'source_supported' ASLA kullanma (orijinal videoda doğrulanmadı). " +
      "Senin eklediğin arka plan='external_context', çıkarım='inference', emin değilsen='uncertain'. " +
      "Bilgi UYDURMA. SADECE geçerli JSON döndür, başka metin ekleme."
    );
  }
  return (
    "KURAL: Her önemli bilgi için onu DESTEKLEYEN chunk numarasını (chunkIdx) belirt. " +
    "Transkriptte AÇIKÇA olmayan bilgiyi 'source_supported' olarak işaretleme. " +
    "Senin eklediğin arka plan = 'external_context', çıkarım = 'inference', emin değilsen = 'uncertain'. " +
    "Bilgi UYDURMA. SADECE geçerli JSON döndür, başka metin ekleme."
  );
}

const MATERIAL_WORD: Record<SourceBasis, string> = {
  transcript: "transkript",
  summary: "NotebookLM özeti",
};

export function buildSectionAnalysis(
  sectionChunks: readonly ChunkRef[],
  basis: SourceBasis = "transcript"
): PromptPair {
  const mat = MATERIAL_WORD[basis];
  return {
    system:
      `Sen bir öğrenme materyali analistisin. Sana eğitici bir ${mat} BİR BÖLÜMÜNÜN ` +
      "zaman-kodlu parçaları veriliyor. Bu bölümü özetle ve önemli noktaları çıkar. " +
      groundingRuleFor(basis) + " " + UNTRUSTED_DATA_NOTICE,
    user:
      `${mat} parçaları:\n${wrapUntrustedData(formatChunks(sectionChunks))}\n\n` +
      `JSON şeması: {"sectionSummary": "...", "keyPoints": [{"text": "...", "chunkIdx": 0}]}`,
  };
}

export function buildGlobalSynthesis(
  input: {
    title: string;
    channelTitle: string;
    sections: { sectionSummary: string; keyPoints: KeyPointRef[] }[];
  },
  basis: SourceBasis = "transcript"
): PromptPair {
  const sectionsBlock = input.sections
    .map((s, i) => {
      const kp = s.keyPoints.map((k) => `  - (#${k.chunkIdx}) ${k.text}`).join("\n");
      return `Bölüm ${i + 1}: ${s.sectionSummary}\n${kp}`;
    })
    .join("\n\n");
  return {
    system:
      "Sen bir öğrenme mimarısın. Bölüm özetlerinden içeriğin BÜTÜNÜ için üç seviyeli özet üret: " +
      "summaryL1 (tek cümle / 30 saniye), summaryL2 (yönetici özeti), summaryL3 (bölüm bölüm). " +
      "İçeriği şu kategorilerden BİRİNE ata (category alanında slug): yapay_zeka, kisisel_gelisim, " +
      "teknoloji, tasarim, is_finans, pazarlama, saglik_psikoloji, egitim, bilim, diger. " +
      "Ayrıca önemli iddiaları topla; her iddia için kaynak chunkIdx ve groundingType ver. " +
      groundingRuleFor(basis) + " " + UNTRUSTED_DATA_NOTICE,
    user:
      `${wrapUntrustedData(`Başlık: ${input.title}\nKanal: ${input.channelTitle}\n\nBölüm özetleri (chunkIdx parantez içinde):\n${sectionsBlock}`)}\n\n` +
      `JSON şeması: {"summaryL1":"...","summaryL2":"...","summaryL3":"...","category":"yapay_zeka","claims":[{"text":"...","chunkIdx":0,"groundingType":"${grounded(basis)}"}]}`,
  };
}

export function buildConcepts(
  input: { summaryL2: string; keyPoints: KeyPointRef[] },
  basis: SourceBasis = "transcript"
): PromptPair {
  const kp = input.keyPoints.map((k) => `(#${k.chunkIdx}) ${k.text}`).join("\n");
  return {
    system:
      "Sen bir kavram çıkarıcısın. İçerikteki önemli ÖĞRETİLEBİLİR kavramları çıkar (en fazla 12). " +
      "Her kavram için kısa tanım, önem (0-100) ve kavramı destekleyen chunkIdx listesi ver. " +
      groundingRuleFor(basis) + " " + UNTRUSTED_DATA_NOTICE,
    user:
      `${wrapUntrustedData(`Özet: ${input.summaryL2}\n\nÖnemli noktalar (chunkIdx parantez içinde):\n${kp}`)}\n\n` +
      `JSON şeması: {"concepts":[{"label":"...","definition":"...","importance":50,"groundingChunks":[0,1]}]}`,
  };
}

export function buildAssessment(
  input: { concepts: ConceptRef[]; keyPoints: KeyPointRef[] },
  basis: SourceBasis = "transcript"
): PromptPair {
  const conceptBlock = input.concepts.map((c) => `- ${c.label}: ${c.definition}`).join("\n");
  const kp = input.keyPoints.map((k) => `(#${k.chunkIdx}) ${k.text}`).join("\n");
  return {
    system:
      "Sen bir değerlendirme tasarımcısısın. Verilen kavramlardan ve önemli noktalardan AKTİF HATIRLAMA " +
      "materyali üret: flashcard'lar (soru→kısa cevap) ve çoktan seçmeli quiz'ler. " +
      "Quiz distractor'ları (yanlış şıklar) yakın kavramlardan türetilmeli ama net yanlış olmalı; " +
      "rastgele/anlamsız olmamalı. Her item kaynak chunkIdx taşımalı. " +
      groundingRuleFor(basis) + " " + UNTRUSTED_DATA_NOTICE,
    user:
      `${wrapUntrustedData(`Kavramlar:\n${conceptBlock}\n\nÖnemli noktalar (chunkIdx parantez içinde):\n${kp}`)}\n\n` +
      `Her kavram için en az 1 flashcard, toplam en az 3 quiz üret.\n` +
      `JSON şeması: {"flashcards":[{"front":"...","back":"...","conceptLabel":"...","difficulty":2,"chunkIdx":0,"groundingType":"${grounded(basis)}"}],` +
      `"quizzes":[{"stem":"...","options":["...","..."],"correctIdx":0,"rationale":"...","conceptLabel":"...","difficulty":2,"chunkIdx":0,"groundingType":"${grounded(basis)}"}]}`,
  };
}

// ── 4C-D yeni aşamalar ──

export function buildNotes(
  input: { summaryL2: string; keyPoints: KeyPointRef[]; concepts: ConceptRef[] },
  basis: SourceBasis = "transcript"
): PromptPair {
  const kp = input.keyPoints.map((k) => `(#${k.chunkIdx}) ${k.text}`).join("\n");
  const conceptBlock = input.concepts.map((c) => `- ${c.label}`).join("\n") || "(henüz kavram yok)";
  return {
    system:
      "Sen bir Zettelkasten not alıcısısın. İçerikten ATOMİK notlar üret: her not TEK bir fikri " +
      "kendi başına anlaşılır biçimde anlatır (başlık + kısa gövde). Uzun/çok-fikirli not YAZMA. " +
      "Her nota destekleyen chunkIdx listesi (chunkIdxs) ve varsa ilgili kavram etiketleri ver. " +
      groundingRuleFor(basis) + " " + UNTRUSTED_DATA_NOTICE,
    user:
      `${wrapUntrustedData(`Özet: ${input.summaryL2}\n\nKavramlar:\n${conceptBlock}\n\nÖnemli noktalar (chunkIdx parantez içinde):\n${kp}`)}\n\n` +
      `En az 3 atomik not üret.\n` +
      `JSON şeması: {"atomicNotes":[{"title":"...","body":"...","tags":["..."],"chunkIdxs":[0],"groundingType":"${grounded(basis)}","relatedConceptLabels":["..."]}]}`,
  };
}

export function buildGraph(
  input: { concepts: ConceptRef[]; noteTitles: string[] },
  basis: SourceBasis = "transcript"
): PromptPair {
  const conceptBlock = input.concepts.map((c) => `- ${c.label}: ${c.definition}`).join("\n");
  const notesBlock = input.noteTitles.map((t) => `- ${t}`).join("\n") || "(not yok)";
  return {
    system:
      "Sen bir bilgi haritacısısın. Verilen kavramlar (ve notlar) ARASINDAKİ anlamlı ilişkileri kur. " +
      "Her ilişki: sourceLabel, targetLabel (tam olarak verilen etiketlerden biri) ve bir relation " +
      "etiketi (ör. 'önkoşul', 'örnek', 'karşıt', 'parça', 'neden'). İlişkiler çoğunlukla çıkarımdır " +
      "→ groundingType genelde 'inference'; materyalde açıkça söyleniyorsa uygun grounded tür. " +
      "Var olmayan etikete bağlama. " +
      groundingRuleFor(basis) + " " + UNTRUSTED_DATA_NOTICE,
    user:
      `${wrapUntrustedData(`Kavramlar:\n${conceptBlock}\n\nNotlar:\n${notesBlock}`)}\n\n` +
      `JSON şeması: {"edges":[{"sourceLabel":"...","targetLabel":"...","relation":"önkoşul","groundingType":"inference"}]}`,
  };
}

export function buildTasks(
  input: { summaryL2: string; concepts: ConceptRef[]; keyPoints: KeyPointRef[] },
  basis: SourceBasis = "transcript"
): PromptPair {
  const conceptBlock = input.concepts.map((c) => `- ${c.label}: ${c.definition}`).join("\n");
  const kp = input.keyPoints.map((k) => `(#${k.chunkIdx}) ${k.text}`).join("\n");
  return {
    system:
      "Sen bir uygulama koçusun. İçerikten öğrenilenleri HAYATA GEÇİRECEK somut görevler üret. " +
      "Her görev: title, why (neden uygulanmalı), steps (2-5 somut adım) ve varsa destekleyen chunkIdxs. " +
      "Görevler uygulanabilir olmalı; genel klişe değil. " +
      groundingRuleFor(basis) + " " + UNTRUSTED_DATA_NOTICE,
    user:
      `${wrapUntrustedData(`Özet: ${input.summaryL2}\n\nKavramlar:\n${conceptBlock}\n\nÖnemli noktalar:\n${kp}`)}\n\n` +
      `En az 3 uygulama görevi üret.\n` +
      `JSON şeması: {"tasks":[{"title":"...","why":"...","steps":["..."],"chunkIdxs":[0],"groundingType":"inference"}]}`,
  };
}

export function buildContentIdeas(
  input: { summaryL1: string; concepts: ConceptRef[]; category: string },
  basis: SourceBasis = "transcript"
): PromptPair {
  const conceptBlock = input.concepts.map((c) => `- ${c.label}`).join("\n");
  return {
    system:
      "Sen bir içerik stratejistisin. Öğrenilen kavramlardan bir İÇERİK ÜRETİCİSİ için içerik FİKİRLERİ öner. " +
      "Her fikir: title, angle (bakış açısı), hook (ilk cümle), format (carousel|reel|thread|video), " +
      "sourceConceptLabels (dayandığı kavramlar). Bunlar ÖNERİDİR — yayınlanmış içerik değildir. " +
      groundingRuleFor(basis) + " " + UNTRUSTED_DATA_NOTICE,
    user:
      `${wrapUntrustedData(`Konu özeti: ${input.summaryL1}\nKategori: ${input.category}\n\nKavramlar:\n${conceptBlock}`)}\n\n` +
      `En az 3 içerik fikri üret.\n` +
      `JSON şeması: {"contentIdeas":[{"title":"...","angle":"...","hook":"...","format":"reel","sourceConceptLabels":["..."],"groundingType":"inference"}]}`,
  };
}
