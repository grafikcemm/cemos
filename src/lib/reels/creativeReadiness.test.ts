import { describe, expect, it } from "vitest";
import {
  computeCarouselCreativeReadiness,
  computeReelsCreativeReadiness,
} from "./creativeReadiness";

/** Editoryal readiness saf denetimleri (ADR-036 §E) — üç kavram ayrımı. */

function carouselBase() {
  return {
    cover: "5 araç tek listede",
    slides: [
      { n: 1, copy: "Birinci araç" },
      { n: 2, copy: "İkinci araç" },
      { n: 3, copy: "Kapanış" },
    ],
    caption: "Kaydet.",
    hashtags: ["#ai"],
    slideCountRange: "3-5",
    toolNamed: false,
    evidenceReadiness: "ready" as const,
  };
}

function reelsBase() {
  return {
    hook: "5 araç tek video",
    script: "senaryo",
    timeline: [{ t: "0-3sn" }],
    scenePlan: [{ scene: 1 }],
    screenRecordingPlan: [{ step: 1 }],
    voiceover: "vo",
    cover: "kapak",
    cta: "kaydet",
    caption: "caption",
    hashtags: ["#ai"],
    toolNamed: false,
    evidenceReadiness: "ready" as const,
  };
}

describe("computeCarouselCreativeReadiness", () => {
  it("tam yapı → ready_for_review", () => {
    expect(computeCarouselCreativeReadiness(carouselBase()).status).toBe("ready_for_review");
  });

  it("yapı ihlalleri → needs_edit (numara, kelime, aralık, boş)", () => {
    const r = computeCarouselCreativeReadiness({
      ...carouselBase(),
      slides: [
        { n: 2, copy: "bir iki üç dört beş altı yedi sekiz dokuz on onbir oniki onüç ondört onbeş onaltı onyedi onsekiz ondokuz yirmi yirmibir" },
      ],
    });
    expect(r.status).toBe("needs_edit");
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("slide_numbering");
    expect(codes).toContain("slide_word_limit");
    expect(codes).toContain("slide_count_out_of_range");
  });

  it("kanıtsız fiyat/ücretsiz iddiası → blocked", () => {
    const r = computeCarouselCreativeReadiness({
      ...carouselBase(),
      caption: "Tamamen ücretsiz, %90 indirim!",
    });
    expect(r.status).toBe("blocked");
    expect(r.issues.map((i) => i.code)).toContain("blocked_unverified_claim");
  });

  it("araç adlı + kanıt yok → blocked; kanıt bayat → needs_edit (stale_evidence)", () => {
    const blocked = computeCarouselCreativeReadiness({
      ...carouselBase(),
      toolNamed: true,
      evidenceReadiness: "not_ready",
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.issues.map((i) => i.code)).toContain("blocked_tool_evidence");

    const stale = computeCarouselCreativeReadiness({
      ...carouselBase(),
      toolNamed: true,
      evidenceReadiness: "needs_verify",
    });
    expect(stale.status).toBe("needs_edit");
    expect(stale.issues.map((i) => i.code)).toContain("stale_evidence");
  });

  it("araç kanıtı 'ready' iken ücretsiz iddiası bloklanmaz (kanıtlı iddia)", () => {
    const r = computeCarouselCreativeReadiness({
      ...carouselBase(),
      toolNamed: true,
      evidenceReadiness: "ready",
      caption: "Araç ücretsiz plan sunuyor.",
    });
    expect(r.status).toBe("ready_for_review");
  });
});

describe("computeReelsCreativeReadiness", () => {
  it("tam yapı → ready_for_review; eksik hook/script → needs_edit", () => {
    expect(computeReelsCreativeReadiness(reelsBase()).status).toBe("ready_for_review");
    const r = computeReelsCreativeReadiness({ ...reelsBase(), hook: " ", script: "" });
    expect(r.status).toBe("needs_edit");
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("empty_hook");
    expect(codes).toContain("empty_script");
  });

  it("araçlı içerikte ekran planı eksikse needs_edit; kanıt yoksa blocked", () => {
    const r = computeReelsCreativeReadiness({
      ...reelsBase(),
      toolNamed: true,
      screenRecordingPlan: [],
      evidenceReadiness: "ready",
    });
    expect(r.issues.map((i) => i.code)).toContain("missing_screen_plan");

    const b = computeReelsCreativeReadiness({
      ...reelsBase(),
      toolNamed: true,
      evidenceReadiness: "not_ready",
    });
    expect(b.status).toBe("blocked");
  });
});
