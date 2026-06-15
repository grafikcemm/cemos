import { describe, it, expect } from "vitest";
import {
  isBrandLikeTitle,
  validateTranslation,
  validateScoring,
  validateTweetAngle,
} from "./newsAi";

// Pure validator tests — no LLM/prisma mocks needed.

describe("isBrandLikeTitle", () => {
  it("accepts the two known prod failures", () => {
    expect(isBrandLikeTitle("Raspberry Pi 5 — 16GB RAM")).toBe(true);
    expect(isBrandLikeTitle("ΩFS")).toBe(true);
  });

  it("rejects full sentences", () => {
    expect(isBrandLikeTitle("OpenAI is launching a new developer platform for agents")).toBe(false);
  });

  it("rejects long titles even with few words", () => {
    expect(isBrandLikeTitle("Supercalifragilistic Expialidocious Engine")).toBe(false);
  });

  it("requires an uppercase letter or digit", () => {
    expect(isBrandLikeTitle("some lowercase words")).toBe(false);
  });
});

describe("validateTranslation — brand-like passthrough", () => {
  const turkishSummary =
    "Raspberry Pi 5 artık 16GB RAM seçeneğiyle geliyor; maker projeleri için daha fazla bellek ve aynı fiyat aralığı sunuyor.";

  it("lets a brand title pass through verbatim with a Turkish summary", () => {
    const error = validateTranslation("Raspberry Pi 5 — 16GB RAM", null, {
      tr_title: "Raspberry Pi 5 — 16GB RAM",
      tr_summary: turkishSummary,
    });
    expect(error).toBeNull();
  });

  it("lets a short symbol-name repo pass through", () => {
    const error = validateTranslation("ΩFS", "A distributed file system", {
      tr_title: "ΩFS",
      tr_summary: "ΩFS, dağıtık dosya sistemleri için geliştirilen yeni bir açık kaynak proje olarak dikkat çekiyor.",
    });
    expect(error).toBeNull();
  });

  it("still rejects an untranslated NON-brand title", () => {
    const error = validateTranslation(
      "OpenAI is launching a new developer platform for agents",
      null,
      {
        tr_title: "OpenAI is launching a new developer platform for agents",
        tr_summary: turkishSummary,
      },
    );
    expect(error).not.toBeNull();
  });

  it("still requires a Turkish summary for brand titles", () => {
    const error = validateTranslation("Raspberry Pi 5 — 16GB RAM", null, {
      tr_title: "Raspberry Pi 5 — 16GB RAM",
      tr_summary: "The new Raspberry Pi 5 now ships with 16GB of RAM for makers.",
    });
    expect(error).not.toBeNull();
  });
});

describe("validateTweetAngle", () => {
  it("rejects missing or too-short angles", () => {
    expect(validateTweetAngle(null)).not.toBeNull();
    expect(validateTweetAngle("kısa açı")).not.toBeNull();
  });

  it("rejects bracket placeholders", () => {
    expect(validateTweetAngle("Bu araç şunları yapıyor: [Madde 1] ve [Madde 2]")).not.toBeNull();
  });

  it("rejects generic filler phrases (tr-TR casing)", () => {
    expect(validateTweetAngle("Bu gelişme oyunun kurallarını değiştiriyor, kaçırma")).not.toBeNull();
    expect(validateTweetAngle("Detaylar için okumaya devam et ve takipte kal dostum")).not.toBeNull();
    expect(validateTweetAngle("Bu model devrim yaratacak diyorlar ama bakalım")).not.toBeNull();
  });

  it("accepts a concrete, grounded angle", () => {
    expect(
      validateTweetAngle(
        "Claude artık Notion'daki dökümanlarını okuyup Codex ile kod üretebiliyor — kurulum 5 dakika.",
      ),
    ).toBeNull();
  });
});

describe("validateScoring — angle lint integration", () => {
  const base = {
    relevance_score: 80,
    viral_score: 75,
    confidence_score: 70,
    x_value_score: 78,
    why_people_care: "Tasarımcılar için somut zaman kazancı.",
  };

  it("fails scoring when the angle is a placeholder template", () => {
    const error = validateScoring({ ...base, tweet_angle: "[Madde 1] hakkında konuş" });
    expect(error).not.toBeNull();
  });

  it("passes scoring with a valid angle", () => {
    const error = validateScoring({
      ...base,
      tweet_angle: "Figma'nın yeni AI aracı 3 tıkta varyant üretiyor — tasarım süreci kısalıyor.",
    });
    expect(error).toBeNull();
  });
});
