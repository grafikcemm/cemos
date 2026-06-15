import { describe, it, expect, beforeEach } from "vitest";
import {
  clampPriority,
  normalizeIntent,
  normalizeSentiment,
  buildClassifyUserBlock,
  parseClassifyResponse,
  parseReplyVariants,
  buildReplyUserBlock,
  scoreReplyRisk,
  type ClassifyInputComment,
} from "./comment-pipeline";

describe("clampPriority", () => {
  it(">100 → 100", () => expect(clampPriority(150)).toBe(100));
  it("<0 → 0", () => expect(clampPriority(-5)).toBe(0));
  it("garbage → 0", () => {
    expect(clampPriority("abc")).toBe(0);
    expect(clampPriority(null)).toBe(0);
  });
  it("ondalık yuvarlanır", () => expect(clampPriority(63.7)).toBe(64));
});

describe("normalizeIntent / normalizeSentiment", () => {
  it("bilinen intent korunur", () => expect(normalizeIntent("soru")).toBe("soru"));
  it("bilinmeyen → diğer", () => expect(normalizeIntent("rastgele")).toBe("diğer"));
  it("büyük harf normalize edilir", () => expect(normalizeIntent("Eleştiri")).toBe("eleştiri"));
  it("sentiment poz/neg/nötr", () => {
    expect(normalizeSentiment("pozitif")).toBe("pozitif");
    expect(normalizeSentiment("negative")).toBe("negatif");
    expect(normalizeSentiment("xyz")).toBe("nötr");
  });
});

const BATCH: ClassifyInputComment[] = [
  { commentId: "c0", text: "Harika!" },
  { commentId: "c1", text: "Bu araç ne kadar?" },
];

describe("parseClassifyResponse", () => {
  it("index → commentId eşler", () => {
    const out = parseClassifyResponse(
      {
        items: [
          {
            index: 0,
            lang: "tr",
            trText: "Harika!",
            intent: "övgü",
            intentConfidence: 0.9,
            sentiment: "pozitif",
            priority: 30,
          },
        ],
      },
      BATCH
    );
    expect(out).toHaveLength(1);
    expect(out[0].commentId).toBe("c0");
    expect(out[0].intent).toBe("övgü");
  });
  it("aralık dışı + tekrar index düşürülür", () => {
    const out = parseClassifyResponse({ items: [{ index: 5 }, { index: 0 }, { index: 0 }] }, BATCH);
    expect(out).toHaveLength(1);
    expect(out[0].commentId).toBe("c0");
  });
  it("priority kıskaçlanır", () => {
    const out = parseClassifyResponse({ items: [{ index: 0, priority: 250 }] }, BATCH);
    expect(out[0].priority).toBe(100);
  });
  it("boş/garbage → []", () => {
    expect(parseClassifyResponse(null, BATCH)).toEqual([]);
    expect(parseClassifyResponse({}, BATCH)).toEqual([]);
  });
  it("trText yoksa orijinal metne düşer", () => {
    const out = parseClassifyResponse({ items: [{ index: 1, intent: "soru" }] }, BATCH);
    expect(out[0].trText).toBe("Bu araç ne kadar?");
  });
});

describe("buildClassifyUserBlock", () => {
  it("caption + numaralı yorum içerir", () => {
    const block = buildClassifyUserBlock("Gönderi başlığım", BATCH);
    expect(block).toContain("Gönderi başlığım");
    expect(block).toContain("0)");
    expect(block).toContain("1)");
  });
});

describe("parseReplyVariants", () => {
  it("boş textTr düşürülür, en çok 3", () => {
    const out = parseReplyVariants(
      {
        variants: [
          { textTr: "a" },
          { textTr: "" },
          { textTr: "b" },
          { textTr: "c" },
          { textTr: "d" },
        ],
      },
      "tr"
    );
    expect(out).toHaveLength(3);
  });
  it("tr dilinde textOriginal null", () => {
    const out = parseReplyVariants({ variants: [{ textTr: "a", textOriginal: "x" }] }, "tr");
    expect(out[0].textOriginal).toBeNull();
  });
  it("yabancı dilde textOriginal korunur", () => {
    const out = parseReplyVariants({ variants: [{ textTr: "a", textOriginal: "hello" }] }, "en");
    expect(out[0].textOriginal).toBe("hello");
  });
});

describe("buildReplyUserBlock bilingual", () => {
  it("yabancı dilde textOriginal talimatı içerir", () => {
    const block = buildReplyUserBlock({
      caption: "",
      commentText: "hi",
      trText: "merhaba",
      lang: "en",
      intent: "soru",
    });
    expect(block).toContain("textOriginal");
    expect(block).toContain("'en'");
  });
  it("tr dilinde sadece textTr talimatı", () => {
    const block = buildReplyUserBlock({
      caption: "",
      commentText: "selam",
      trText: "selam",
      lang: "tr",
      intent: "övgü",
    });
    expect(block).toContain("Sadece textTr");
  });
});

describe("scoreReplyRisk fail-open", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });
  it("OPENROUTER yoksa fail-open 70", async () => {
    expect(await scoreReplyRisk("bir yanıt")).toEqual({ safety: 70, usedLlm: false });
  });
});
