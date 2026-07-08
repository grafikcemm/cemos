import { describe, it, expect } from "vitest";
import { runDeterministicHeuristics } from "./heuristics";
import { BANNED_PHRASES } from "./banned-phrases";
import { BANNED_PHRASES as GROUNDING_BANNED } from "@/lib/ai/grounding";

// Seed'li deterministik vakalar (FIRST-SPRINT item 9 kabulü):
// yasak-ifade/klişe-CTA lint'i her koşuda aynı sonucu verir.
const CLICHE_CASES = [
  "Bu araç gerçekten oyunun kurallarını değiştiriyor, mutlaka dene.",
  "Çığır açan bir güncelleme geldi, tasarımcılar hazır olun.",
  "Bu haber şok edici: model artık video da üretiyor.",
];

const QUESTION_CTA_CASES = [
  "AI araçları hızla gelişiyor. Peki siz ne düşünüyorsunuz?",
  "Figma yeni özellik duyurdu. Katılıyor musunuz?",
  "Bu konuda çok şey söylenebilir. Düşüncelerinizi paylaşın.",
];

const CLEAN_CASES = [
  "Midjourney v7'yi 3 client işinde test ettim: stil kilidi --sref ile 2 revizyonu sıfıra indirdi.",
  "Disiplini hisse bağlayan erkek her pazartesi sıfırdan başlar. Sistem kur, his geçer sistem kalır.",
];

describe("banned-phrase / question-CTA lint (deterministik, seed'li)", () => {
  it.each(CLICHE_CASES)("klişe yakalanır: %s", (text) => {
    const result = runDeterministicHeuristics(text, "TWEET", 280);
    expect(result.issues.some((i) => i.code === "banned_phrase")).toBe(true);
  });

  it.each(QUESTION_CTA_CASES)("soru-CTA yakalanır: %s", (text) => {
    const result = runDeterministicHeuristics(text, "TWEET", 280);
    expect(result.issues.some((i) => i.code === "question_cta")).toBe(true);
  });

  it.each(CLEAN_CASES)("temiz metin yanlış pozitif üretmez: %s", (text) => {
    const result = runDeterministicHeuristics(text, "TWEET", 280);
    expect(result.issues.some((i) => i.code === "banned_phrase" || i.code === "question_cta")).toBe(
      false,
    );
  });

  it("warning seviyesinde kalır (silme değil, needs_edit yönlendirmesi)", () => {
    const result = runDeterministicHeuristics(CLICHE_CASES[0], "TWEET", 280);
    const issue = result.issues.find((i) => i.code === "banned_phrase");
    expect(issue?.severity).toBe("warning");
    // banned_phrase tek başına passed'ı düşürmez — kapı draftService'te.
    expect(result.passed).toBe(true);
  });

  it("grounding ve lint AYNI listeden beslenir (tek kaynak)", () => {
    expect(GROUNDING_BANNED).toEqual(BANNED_PHRASES);
  });

  it("Türkçe büyük/küçük harf duyarsız eşleşir (İ/ı)", () => {
    const result = runDeterministicHeuristics(
      "Bu güncelleme İNANILMAZ derecede iyi.",
      "TWEET",
      280,
    );
    expect(result.issues.some((i) => i.code === "banned_phrase")).toBe(true);
  });
});
