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
