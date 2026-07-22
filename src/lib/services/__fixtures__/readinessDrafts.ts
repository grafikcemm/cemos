import type { ReadinessInput } from "../readinessService";

/**
 * Readiness fixture'ları — gözlenen kötü taslak sınıfları (fixture-kilitli).
 * Her biri TEK bir readiness kuralını tetikler; hiçbiri `ready` olamaz.
 * `goodDraft` bilinen-iyi → `ready`.
 */
export function baseDraft(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    content:
      "Bir görselin AI mı gerçek mi olduğunu 5 dakikada test ediyorum: TinEye ters görsel arama yapıyor, Google Lens ilk yükleme tarihini gösteriyor.",
    editedContent: null,
    status: "new",
    draftType: "TWEET",
    accountHandle: "grafikcem",
    maxChars: 1500,
    judged: true,
    turkishNaturalness: 90,
    riskScore: 12,
    sourceFaithfulness: 80,
    leaks: [],
    lintIssues: [],
    hasSource: true,
    threadSegments: null,
    ...overrides,
  };
}

export const goodDraft: ReadinessInput = baseDraft();

export type BadDraft = { name: string; input: ReadinessInput; expected: "needs_edit" | "blocked"; expectCode: string };

export const badDrafts: BadDraft[] = [
  {
    name: "yabancı-dil sızıntısı",
    expected: "needs_edit",
    expectCode: "foreign_language",
    input: baseDraft({
      content:
        "This is the best way to verify images with these tools, and you should try them for your own content today.",
    }),
  },
  {
    name: "hesap-politikasına aykırı soru-CTA",
    expected: "needs_edit",
    expectCode: "question_cta",
    input: baseDraft({
      lintIssues: [{ code: "question_cta", message: "Sona klişe soru-CTA eklenmiş — @grafikcem bunu kullanmaz." }],
    }),
  },
  {
    name: "hesap-politikasına aykırı emoji",
    expected: "needs_edit",
    expectCode: "emoji_policy",
    input: baseDraft({
      content: "Bir görselin AI mı gerçek mi olduğunu test ediyorum 🔥🚀 TinEye ile ters arama yapıyorum.",
    }),
  },
  {
    name: "kaynaksız somut istatistik iddiası",
    expected: "blocked",
    expectCode: "unverified_concrete_claim",
    input: baseDraft({
      content: "ChatGPT'nin haftalık aktif kullanıcı sayısı 800 milyonu geçti, pazarın %70'ini tek başına aldı.",
      hasSource: false,
    }),
  },
  {
    name: "yapısız thread ('1/' kanıt değil)",
    expected: "needs_edit",
    expectCode: "structureless_thread",
    input: baseDraft({
      draftType: "THREAD",
      content: "1/ Görsel doğrulama üzerine kısa bir dizi. 2/ TinEye ters arama. 3/ Google Lens tarih.",
      threadSegments: null,
    }),
  },
  {
    name: "düşük Türkçe doğallık",
    expected: "needs_edit",
    expectCode: "low_turkish",
    input: baseDraft({ turkishNaturalness: 40 }),
  },
];
