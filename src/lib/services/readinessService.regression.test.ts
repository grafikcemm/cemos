import { describe, it, expect } from "vitest";
import { assessReadiness, type ReadinessInput } from "./readinessService";
import { goodDraft, badDrafts, baseDraft } from "./__fixtures__/readinessDrafts";

describe("readinessService — fixture regression (fail-closed)", () => {
  it("bilinen-iyi taslak → ready", () => {
    const r = assessReadiness(goodDraft);
    expect(r.state, JSON.stringify(r.reasons)).toBe("ready");
    expect(r.reasons).toEqual([]);
  });

  for (const bad of badDrafts) {
    it(`kötü fixture "${bad.name}" → ${bad.expected} (asla ready)`, () => {
      const r = assessReadiness(bad.input);
      expect(r.state, `beklenen ${bad.expected}, gelen ${r.state} — ${JSON.stringify(r.reasons)}`).toBe(bad.expected);
      expect(r.state).not.toBe("ready");
      expect(r.reasons.map((x) => x.code)).toContain(bad.expectCode);
    });
  }
});

describe("readinessService — fail-closed skorlar", () => {
  it("judged=false ASLA ready (aksi her şey iyi olsa da)", () => {
    const r = assessReadiness(baseDraft({ judged: false }));
    expect(r.state).toBe("needs_edit");
    expect(r.reasons.map((x) => x.code)).toContain("not_judged");
  });

  it("skor eksik (turkishNaturalness=null) → needs_edit", () => {
    const r = assessReadiness(baseDraft({ turkishNaturalness: null }));
    expect(r.state).toBe("needs_edit");
    expect(r.reasons.map((x) => x.code)).toContain("missing_score");
  });
});

describe("readinessService — blocked öncelikli ve dar", () => {
  it("char-limit aşımı → blocked", () => {
    const r = assessReadiness(baseDraft({ content: "a".repeat(1600), maxChars: 1500, editedContent: null }));
    expect(r.state).toBe("blocked");
    expect(r.reasons.map((x) => x.code)).toContain("over_char_limit");
  });

  it("yüksek risk → blocked", () => {
    const r = assessReadiness(baseDraft({ riskScore: 82 }));
    expect(r.state).toBe("blocked");
    expect(r.reasons.map((x) => x.code)).toContain("high_risk");
  });

  it("blocked, needs_edit'ten öncelikli (ikisi de tetiklense)", () => {
    // düşük türkçe (edit) + yüksek risk (block) → block kazanır
    const r = assessReadiness(baseDraft({ riskScore: 90, turkishNaturalness: 30 }));
    expect(r.state).toBe("blocked");
  });

  it("kaynaklı somut iddia BLOCK ETMEZ (kaynak var)", () => {
    const r = assessReadiness(
      baseDraft({ content: "Rapor: pazarın %70'i tek modelde.", hasSource: true }),
    );
    expect(r.state).not.toBe("blocked");
  });

  it("küçük tamsayı ('5 dakikada') kaynaksız olsa da BLOCK ETMEZ", () => {
    const r = assessReadiness(baseDraft({ hasSource: false }));
    expect(r.state).toBe("ready");
  });
});

describe("readinessService — editedContent ?? content üzerinden değerlendirir", () => {
  it("kötü content düzenlenince (editedContent) ready olabilir", () => {
    const input: ReadinessInput = baseDraft({
      content: "This is the leaked english draft with these tools and your content.",
      editedContent: "Görsel doğrulama araçlarını Türkçe anlatan temiz bir taslak metni.",
    });
    const r = assessReadiness(input);
    expect(r.state).toBe("ready");
  });

  it("editedContent boşsa content'e düşer", () => {
    const r = assessReadiness(
      baseDraft({ content: "This is the english with these your them and that.", editedContent: "   " }),
    );
    expect(r.state).toBe("needs_edit");
    expect(r.reasons.map((x) => x.code)).toContain("foreign_language");
  });
});

describe("readinessService — thread yapısal doğrulama", () => {
  it("geçerli segmentli thread → ready ('1/' gerekmeden yapısal)", () => {
    const r = assessReadiness(
      baseDraft({
        draftType: "THREAD",
        threadSegments: [
          { text: "Görsel doğrulama üzerine kısa bir dizi başlıyor." },
          { text: "TinEye ile ters görsel arama nasıl yapılır." },
          { text: "Google Lens ilk yükleme tarihini nasıl gösterir." },
        ],
      }),
    );
    expect(r.state).toBe("ready");
  });

  it("boş segmentli thread → needs_edit", () => {
    const r = assessReadiness(
      baseDraft({ draftType: "THREAD", threadSegments: [{ text: "Dolu segment." }, { text: "   " }] }),
    );
    expect(r.state).toBe("needs_edit");
    expect(r.reasons.map((x) => x.code)).toContain("thread_segment_invalid");
  });
});

describe("readinessService — Phase 2D segment sınırı parity (ADR-033)", () => {
  const seg = (n: number) => ({ text: "x".repeat(n) });
  const threadBase = (over: Partial<ReadinessInput> = {}) =>
    baseDraft({
      draftType: "THREAD",
      threadSegments: [
        { text: "Hook segmenti burada." },
        { text: "Orta segment somut değer taşıyor." },
      ],
      ...over,
    });

  it("280 sınırındaki segment GEÇER (hesap maxChars 1500 olsa bile sınır 280)", () => {
    const r = assessReadiness(threadBase({ threadSegments: [seg(280), { text: "kapanış" }] }));
    expect(r.state, JSON.stringify(r.reasons)).toBe("ready");
  });

  it("281 karakterlik segment → needs_edit (eski davranış 1500'e kadar geçiriyordu — kapandı)", () => {
    const r = assessReadiness(threadBase({ threadSegments: [seg(281), { text: "kapanış" }] }));
    expect(r.state).toBe("needs_edit");
    expect(r.reasons.map((x) => x.code)).toContain("thread_segment_invalid");
  });

  it("hesap maxChars 140 ise 141'lik segment reddedilir (effective limit = min(280, maxChars))", () => {
    const r = assessReadiness(threadBase({ maxChars: 140, threadSegments: [seg(141), { text: "b" }] }));
    expect(r.state).toBe("needs_edit");
    expect(r.reasons.map((x) => x.code)).toContain("thread_segment_invalid");
  });

  it("tek segmentli thread geçmez (thread_too_short)", () => {
    const r = assessReadiness(threadBase({ threadSegments: [{ text: "tek segment" }] }));
    expect(r.state).toBe("needs_edit");
    expect(r.reasons.map((x) => x.code)).toContain("thread_too_short");
  });

  it("mode=thread + draftType=TWEET (tarihî uyumsuz sınıf) yapısız → needs_edit; tek tweet gibi READY GEÇEMEZ", () => {
    // Audit 2026-07-16: canlıdaki 13/13 kayıt bu sınıftaydı ve 12'si yanlış ready idi.
    const r = assessReadiness(
      baseDraft({
        draftType: "TWEET",
        mode: "thread",
        content: "1/ Uzun thread metni\n2/ ikinci kısım — yapısal segment YOK.",
        threadSegments: null,
      }),
    );
    expect(r.state).toBe("needs_edit");
    expect(r.reasons.map((x) => x.code)).toContain("structureless_thread");
  });

  it("metindeki '1/' numaralandırma tek başına yapısal kanıt DEĞİL", () => {
    const r = assessReadiness(
      baseDraft({ draftType: "THREAD", content: "1/ birinci\n\n2/ ikinci", threadSegments: null }),
    );
    expect(r.state).toBe("needs_edit");
    expect(r.reasons.map((x) => x.code)).toContain("structureless_thread");
  });

  it("stale QueueItem.content güvenlik kontrolünü BYPASS EDEMEZ — thread metni canonical segmentlerden", () => {
    // content temiz ama segmentlerde kaynaksız somut iddia var → blocked.
    const r = assessReadiness(
      threadBase({
        hasSource: false,
        content: "Tertemiz eski birleşik metin (stale).",
        editedContent: null,
        threadSegments: [
          { text: "Bu araç maliyeti %90 düşürüyor." }, // kaynaksız somut iddia
          { text: "İkinci segment." },
        ],
      }),
    );
    expect(r.state).toBe("blocked");
    expect(r.reasons.map((x) => x.code)).toContain("unverified_concrete_claim");
  });

  it("thread'in birleşik toplam uzunluğu 280'i aşsa da segmentler uygunsa over_char_limit TETİKLENMEZ", () => {
    const r = assessReadiness(
      threadBase({
        maxChars: 280,
        threadSegments: [seg(250), seg(250), seg(250)], // toplam 750 > 280
      }),
    );
    expect(r.reasons.map((x) => x.code)).not.toContain("over_char_limit");
    expect(r.state, JSON.stringify(r.reasons)).toBe("ready");
  });
});

describe("readinessService — dinamik hesap (ADR-031/033)", () => {
  it("bilinmeyen hesap grafikcem'e DÜŞMEZ: emoji politikası sızmaz", () => {
    const r = assessReadiness(
      baseDraft({ accountHandle: "yenihesap", content: "Temiz Türkçe taslak 🚀 emoji ile." }),
    );
    expect(r.reasons.map((x) => x.code)).not.toContain("emoji_policy");
  });

  it("seed'li politika yalnız EXACT eşleşmede: 'grafikcem2' emoji kuralı almaz", () => {
    const r = assessReadiness(
      baseDraft({ accountHandle: "grafikcem2", content: "Temiz Türkçe taslak 🚀 emoji ile." }),
    );
    expect(r.reasons.map((x) => x.code)).not.toContain("emoji_policy");
  });
});

describe("readinessService — hesap-bazlı emoji politikası", () => {
  it("@grafikcem emoji → needs_edit", () => {
    const r = assessReadiness(baseDraft({ content: "Temiz Türkçe taslak 🚀 emoji ile." }));
    expect(r.reasons.map((x) => x.code)).toContain("emoji_policy");
  });

  it("@maskulenkod emoji → emoji-policy TETİKLEMEZ (hesap kuralı yok)", () => {
    const r = assessReadiness(
      baseDraft({ accountHandle: "maskulenkod", maxChars: 1200, content: "Temiz Türkçe taslak 🚀 emoji ile." }),
    );
    expect(r.reasons.map((x) => x.code)).not.toContain("emoji_policy");
  });
});
