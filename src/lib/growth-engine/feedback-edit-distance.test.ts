import { describe, it, expect } from "vitest";
import {
  computeNormalizedEditDistance,
  mergeReasonWithEditDistance,
  parseFeedbackReason,
  buildFeedbackEventInput,
} from "./feedback-service";
import type { FeedbackApiInput } from "./types";

const baseInput: FeedbackApiInput = {
  accountId: "acc-1",
  accountHandle: "grafikcem",
  feedbackType: "edited",
  originalContent: "Midjourney v7 stil kilidi --sref ile geliyor.",
  editedContent: "Midjourney v7'de stil kilidi --sref parametresiyle geliyor; 2 dakikada 4 varyant.",
  reason: "fazla kuru anlatım",
} as FeedbackApiInput;

describe("edit-distance (FIRST-SPRINT item 13)", () => {
  it("normalized Levenshtein 0..1 aralığında hesaplanır", () => {
    const d = computeNormalizedEditDistance("abc metin", "abc metin farklı ek");
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
    expect(d!).toBeLessThan(1);
  });

  it("aynı metin → 0; boş içerik → null", () => {
    expect(computeNormalizedEditDistance("aynı metin", "aynı metin")).toBe(0);
    expect(computeNormalizedEditDistance("", "bir şey")).toBeNull();
    expect(computeNormalizedEditDistance("bir şey", null)).toBeNull();
  });

  it("mergeReason: düz string kullanıcı nedeni EZİLMEZ", () => {
    const merged = mergeReasonWithEditDistance("fazla kurumsal", 0.42);
    expect(JSON.parse(merged)).toEqual({ text: "fazla kurumsal", editDistance: 0.42 });
  });

  it("mergeReason: mevcut JSON alanları korunur", () => {
    const merged = mergeReasonWithEditDistance('{"text":"ton sert","tag":"voice"}', 0.2);
    expect(JSON.parse(merged)).toEqual({ text: "ton sert", tag: "voice", editDistance: 0.2 });
  });

  it("parseFeedbackReason: eski düz string geriye uyumlu", () => {
    expect(parseFeedbackReason("eski neden")).toEqual({ text: "eski neden" });
  });

  it("parseFeedbackReason: yeni JSON formatı okunur", () => {
    const parsed = parseFeedbackReason('{"text":"fazla kurumsal","editDistance":0.42}');
    expect(parsed.text).toBe("fazla kurumsal");
    expect(parsed.editDistance).toBe(0.42);
  });

  it("edited event: reason'a editDistance merge edilir + kullanıcı nedeni korunur", () => {
    const evt = buildFeedbackEventInput(baseInput);
    const parsed = parseFeedbackReason(evt.reason);
    expect(parsed.text).toBe("fazla kuru anlatım");
    expect(typeof parsed.editDistance).toBe("number");
    expect(parsed.editDistance!).toBeGreaterThan(0);
  });

  it("make_stronger / make_clearer da edited etiketiyle distance alır", () => {
    const evt = buildFeedbackEventInput({ ...baseInput, feedbackType: "make_stronger" });
    expect(parseFeedbackReason(evt.reason).editDistance).toBeDefined();
  });

  it("approved/rejected event'te reason DEĞİŞMEZ (distance yazılmaz)", () => {
    const approved = buildFeedbackEventInput({ ...baseInput, feedbackType: "approved" });
    expect(approved.reason).toBe("fazla kuru anlatım");
    const rejected = buildFeedbackEventInput({ ...baseInput, feedbackType: "rejected" });
    expect(rejected.reason).toBe("fazla kuru anlatım");
  });

  it("edited ama içeriklerden biri boş → distance yazılmaz, reason aynı kalır", () => {
    const evt = buildFeedbackEventInput({ ...baseInput, originalContent: undefined });
    expect(evt.reason).toBe("fazla kuru anlatım");
  });
});
