import { describe, it, expect } from "vitest";
import {
  parseThreadSegments,
  serializeThreadSegments,
  normalizeThreadSegments,
  joinThreadSegments,
  canonicalThreadPayload,
  validateThreadSegments,
  effectiveThreadSegmentLimit,
  isThreadDraft,
  threadPublicationHashInput,
  THREAD_MIN_SEGMENTS,
  THREAD_SCHEMA_MAX_SEGMENTS,
} from "./threadSegments";

describe("threadSegments Zod sözleşmesi", () => {
  it("geçerli JSON → segment listesi", () => {
    const raw = JSON.stringify([{ text: "İlk" }, { text: "İkinci" }]);
    expect(parseThreadSegments(raw)).toEqual([{ text: "İlk" }, { text: "İkinci" }]);
  });

  it("null/boş/geçersiz JSON → null (fail-closed)", () => {
    expect(parseThreadSegments(null)).toBeNull();
    expect(parseThreadSegments("")).toBeNull();
    expect(parseThreadSegments("   ")).toBeNull();
    expect(parseThreadSegments("not json")).toBeNull();
    expect(parseThreadSegments("[]")).toBeNull(); // boş dizi → null
    expect(parseThreadSegments(JSON.stringify([{ notText: 1 }]))).toBeNull();
  });

  it("serialize → parse roundtrip", () => {
    const segs = [{ text: "a" }, { text: "b" }, { text: "c" }];
    expect(parseThreadSegments(serializeThreadSegments(segs))).toEqual(segs);
  });

  it("serialize fazladan alanı atar (yalnız text)", () => {
    const raw = serializeThreadSegments([{ text: "x", extra: 9 } as unknown as { text: string }]);
    expect(JSON.parse(raw)).toEqual([{ text: "x" }]);
  });
});

describe("threadSegments — Phase 2D canonical sözleşme (ADR-033)", () => {
  it("effectiveThreadSegmentLimit = min(280, maxChars); geçersiz → 280", () => {
    expect(effectiveThreadSegmentLimit(1500)).toBe(280);
    expect(effectiveThreadSegmentLimit(140)).toBe(140);
    expect(effectiveThreadSegmentLimit(0)).toBe(280);
    expect(effectiveThreadSegmentLimit(-5)).toBe(280);
    expect(effectiveThreadSegmentLimit(NaN)).toBe(280);
  });

  it("isThreadDraft: draftType=THREAD VEYA mode=thread (audit'teki uyumsuz sınıf dahil)", () => {
    expect(isThreadDraft("THREAD")).toBe(true);
    expect(isThreadDraft("thread")).toBe(true);
    expect(isThreadDraft("TWEET", "thread")).toBe(true); // canlıdaki 13/13 sınıf
    expect(isThreadDraft("TWEET", "hot_take")).toBe(false);
    expect(isThreadDraft("TWEET")).toBe(false);
    expect(isThreadDraft(null, null)).toBe(false);
  });

  it("normalize: trim + boşları at; hepsi boşsa null", () => {
    expect(normalizeThreadSegments([{ text: " a " }, { text: "  " }, { text: "b" }])).toEqual([
      { text: "a" },
      { text: "b" },
    ]);
    expect(normalizeThreadSegments([{ text: "  " }])).toBeNull();
    expect(normalizeThreadSegments(null)).toBeNull();
  });

  it("join: '\\n\\n' ile canonical birleşim (array sırası = thread sırası)", () => {
    expect(joinThreadSegments([{ text: "hook" }, { text: "orta" }, { text: "payoff" }])).toBe(
      "hook\n\norta\n\npayoff"
    );
  });

  it("canonicalThreadPayload: content HER ZAMAN segmentlerden türetilir", () => {
    const p = canonicalThreadPayload([{ text: " a " }, { text: "b" }]);
    expect(p.segments).toEqual([{ text: "a" }, { text: "b" }]);
    expect(p.content).toBe("a\n\nb");
  });

  it("validate: 280 sınırındaki segment GEÇER, 281 geçmez", () => {
    const seg280 = "x".repeat(280);
    const seg281 = "x".repeat(281);
    expect(validateThreadSegments([{ text: seg280 }, { text: "b" }], 280).ok).toBe(true);
    const bad = validateThreadSegments([{ text: seg281 }, { text: "b" }], 280);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0]).toMatchObject({ code: "over_limit", index: 0, limit: 280 });
  });

  it("validate: hesap maxChars 140 ise 141'lik segment reddedilir", () => {
    const limit = effectiveThreadSegmentLimit(140);
    const bad = validateThreadSegments([{ text: "x".repeat(141) }, { text: "b" }], limit);
    expect(bad.ok).toBe(false);
  });

  it(`validate: tek segment thread geçmez (min ${THREAD_MIN_SEGMENTS})`, () => {
    const bad = validateThreadSegments([{ text: "tek" }], 280);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.some((i) => i.code === "too_few_segments")).toBe(true);
  });

  it("validate: boş segment geçmez", () => {
    const bad = validateThreadSegments([{ text: "a" }, { text: "   " }], 280);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.some((i) => i.code === "empty_segment")).toBe(true);
  });

  it(`validate: şema tavanı ${THREAD_SCHEMA_MAX_SEGMENTS} üstü geçmez`, () => {
    const many = Array.from({ length: THREAD_SCHEMA_MAX_SEGMENTS + 1 }, (_, i) => ({ text: `s${i}` }));
    const bad = validateThreadSegments(many, 280);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.some((i) => i.code === "too_many_segments")).toBe(true);
  });

  it("hash girdisi: segment SIRASI değişince değişir; aynı payload aynı", () => {
    const a = threadPublicationHashInput([{ text: "bir" }, { text: "iki" }]);
    const b = threadPublicationHashInput([{ text: "iki" }, { text: "bir" }]);
    const c = threadPublicationHashInput([{ text: "bir" }, { text: "iki" }]);
    expect(a).not.toBe(b);
    expect(a).toBe(c);
  });

  it("hash girdisi: uzunluk-öncekli çerçeveleme ayraç çakışmasını keser", () => {
    const a = threadPublicationHashInput([{ text: "ab" }, { text: "c" }]);
    const b = threadPublicationHashInput([{ text: "ab 1:c" }]);
    expect(a).not.toBe(b);
  });
});
