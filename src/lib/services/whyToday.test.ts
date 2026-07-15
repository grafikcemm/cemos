import { describe, it, expect } from "vitest";
import { whyToday, verificationLabel, type WhyTodayInput } from "./whyToday";

const NOW = 1_700_000_000_000;
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

function news(sourceVerification: string | null, hAgo = 3): WhyTodayInput["newsItem"] {
  return { sourceVerification, whyPeopleCare: "Görsel doğrulama haberi", title: "C2PA", fetchedAt: hoursAgo(hAgo) };
}

describe("whyToday — 5 doğrulama durumu", () => {
  it("multi_source_confirmed → verified (isClaimVerified)", () => {
    const r = whyToday({ newsItem: news("multi_source_confirmed"), sourcePost: null, nowMs: NOW });
    expect(r.verification).toBe("verified");
    expect(r.isClaimVerified).toBe(true);
  });

  it("editorial_confirmed → verified", () => {
    expect(whyToday({ newsItem: news("editorial_confirmed"), sourcePost: null, nowMs: NOW }).verification).toBe("verified");
  });

  it("official_only / single_source → partially_verified (iddia doğrulanmadı)", () => {
    for (const v of ["official_only", "single_source"]) {
      const r = whyToday({ newsItem: news(v), sourcePost: null, nowMs: NOW });
      expect(r.verification, v).toBe("partially_verified");
      expect(r.isClaimVerified).toBe(false);
    }
  });

  it("kaynak bağlı ama sınıflandırma yok → source_available (≠ doğrulandı)", () => {
    const r = whyToday({ newsItem: news(null), sourcePost: null, nowMs: NOW });
    expect(r.verification).toBe("source_available");
    expect(r.isClaimVerified).toBe(false);
  });

  it("hiç kaynak yok → unverified", () => {
    const r = whyToday({ newsItem: null, sourcePost: null, nowMs: NOW });
    expect(r.verification).toBe("unverified");
    expect(r.reason).toBeNull();
  });

  it("kaynak 24 saatten eski → stale (doğrulama yüksek olsa da)", () => {
    const r = whyToday({ newsItem: news("multi_source_confirmed", 30), sourcePost: null, nowMs: NOW });
    expect(r.verification).toBe("stale");
    expect(r.isClaimVerified).toBe(false);
  });
});

describe("whyToday — scannedAt fact-check DEĞİL", () => {
  it("yalnız SourcePost.scannedAt varsa (news yok) → source_available, verified değil", () => {
    const r = whyToday({
      newsItem: null,
      sourcePost: { scannedAt: hoursAgo(2), publishedAt: null, url: "https://x.com" },
      nowMs: NOW,
    });
    // Taranmış olmak doğrulanmış olmak DEĞİL.
    expect(r.verification).toBe("source_available");
    expect(r.isClaimVerified).toBe(false);
  });

  it("isClaimVerified YALNIZ verified'da true", () => {
    for (const [v, expected] of [
      ["multi_source_confirmed", true],
      ["official_only", false],
      [null, false],
    ] as const) {
      expect(whyToday({ newsItem: news(v), sourcePost: null, nowMs: NOW }).isClaimVerified).toBe(expected);
    }
  });
});

describe("whyToday — kart/drawer tutarlılığı (deterministik)", () => {
  it("aynı girdi → aynı sonuç (tek kaynak)", () => {
    const input: WhyTodayInput = { newsItem: news("official_only"), sourcePost: null, nowMs: NOW };
    expect(whyToday(input)).toEqual(whyToday(input));
  });

  it("reason kaynak + tazelik içerir", () => {
    const r = whyToday({ newsItem: news("verified" as string, 3), sourcePost: null, nowMs: NOW });
    expect(r.reason).toContain("Görsel doğrulama haberi");
    expect(r.reason).toContain("saat önce");
  });
});

describe("verificationLabel", () => {
  it("source_available 'Kaynak mevcut' (doğrulandı DEĞİL)", () => {
    expect(verificationLabel("source_available")).toBe("Kaynak mevcut");
    expect(verificationLabel("verified")).toBe("Doğrulandı");
    expect(verificationLabel("partially_verified")).toBe("Kısmen doğrulandı");
  });
});
