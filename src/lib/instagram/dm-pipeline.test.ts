import { describe, it, expect } from "vitest";
import {
  parseDmTranslateResponse,
  parseDmVariants,
  buildDmDraftUserBlock,
  type DmTranslateInput,
} from "@/lib/instagram/dm-pipeline";

describe("parseDmTranslateResponse", () => {
  const batch: DmTranslateInput[] = [
    { messageId: "m0", text: "hello" },
    { messageId: "m1", text: "merhaba" },
  ];

  it("index'i batch sırasına göre messageId'ye eşler", () => {
    const out = parseDmTranslateResponse(
      { items: [{ index: 0, lang: "en", trText: "selam" }] },
      batch
    );
    expect(out).toEqual([{ messageId: "m0", lang: "en", trText: "selam" }]);
  });

  it("aralık dışı ve tekrar index'i düşürür", () => {
    const out = parseDmTranslateResponse(
      {
        items: [
          { index: 5, lang: "en", trText: "x" },
          { index: 1, lang: "tr", trText: "merhaba" },
          { index: 1, lang: "tr", trText: "tekrar" },
        ],
      },
      batch
    );
    expect(out).toEqual([{ messageId: "m1", lang: "tr", trText: "merhaba" }]);
  });

  it("boş trText'te orijinal metne düşer; lang yoksa tr", () => {
    const out = parseDmTranslateResponse({ items: [{ index: 0, trText: "" }] }, batch);
    expect(out[0]).toEqual({ messageId: "m0", lang: "tr", trText: "hello" });
  });

  it("bozuk/eksik girdide boş döner", () => {
    expect(parseDmTranslateResponse(null, batch)).toEqual([]);
    expect(parseDmTranslateResponse({}, batch)).toEqual([]);
  });
});

describe("parseDmVariants", () => {
  it("en çok 2 varyant döndürür", () => {
    const out = parseDmVariants(
      {
        variants: [
          { textTr: "a", tone: "samimi" },
          { textTr: "b", tone: "net" },
          { textTr: "c", tone: "yardımsever" },
        ],
      },
      "tr"
    );
    expect(out).toHaveLength(2);
  });

  it("Türkçe'de textOriginal'i null bırakır", () => {
    const out = parseDmVariants(
      { variants: [{ textTr: "merhaba", textOriginal: "hello", tone: "samimi" }] },
      "tr"
    );
    expect(out[0].textOriginal).toBeNull();
  });

  it("yabancı dilde textOriginal'i korur", () => {
    const out = parseDmVariants(
      { variants: [{ textTr: "merhaba", textOriginal: "hello", tone: "samimi" }] },
      "en"
    );
    expect(out[0].textOriginal).toBe("hello");
  });

  it("boş textTr'li varyantı atlar", () => {
    const out = parseDmVariants({ variants: [{ textTr: "", tone: "x" }, { textTr: "ok" }] }, "tr");
    expect(out).toHaveLength(1);
    expect(out[0].textTr).toBe("ok");
  });
});

describe("buildDmDraftUserBlock", () => {
  it("yabancı dilde iki-dilli talimat içerir", () => {
    const block = buildDmDraftUserBlock({
      rollingSummary: "özet",
      recentMessages: [{ fromMe: false, text: "hi", trText: "selam" }],
      lang: "en",
    });
    expect(block).toContain("textOriginal");
    expect(block).toContain("özet");
  });

  it("Türkçe'de sadece textTr ister", () => {
    const block = buildDmDraftUserBlock({
      rollingSummary: "",
      recentMessages: [{ fromMe: true, text: "ok", trText: "" }],
      lang: "tr",
    });
    expect(block).toContain("Sadece textTr");
  });
});
