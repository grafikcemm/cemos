/**
 * Editoryal (creative) readiness — SAF, deterministik (ADR-036 §E).
 *
 * ÜÇ AYRI KAVRAM, ASLA KARIŞMAZ:
 *  1. Üretim durumu (generator outcome)
 *  2. Site/kanıt doğrulaması (`finalReadiness` — evidence readiness, KOD kararı)
 *  3. İnsan onayı (TrainingExample varlığı — approval)
 * Bu modül yalnız (creative) içerik yapısını denetler: "site açılıyor" içerik
 * onayı DEĞİLDİR; "model üretti" yayına hazır DEĞİLDİR.
 */

export type CreativeReadinessStatus = "ready_for_review" | "needs_edit" | "blocked";
export type CreativeIssue = { code: string; message: string };
export type CreativeReadiness = { status: CreativeReadinessStatus; issues: CreativeIssue[] };

export const SLIDE_WORD_LIMIT = 20;

/** Kanıtsızken somut fiyat/ücretsiz/istatistik iddiası (deterministik tarama). */
export const UNVERIFIED_CLAIM_RE =
  /(\d+\s*(tl|₺|\$|usd|dolar|euro|€))|(%\s*\d+)|(\b(ücretsiz|bedava|free)\b)/iu;

export type EvidenceReadiness = "ready" | "needs_verify" | "not_ready";

export type CarouselCreativeInput = {
  cover: string;
  slides: Array<{ n: number; copy: string; visual?: string }>;
  caption: string;
  hashtags: string[];
  /** Seri sözleşmesi biliniyorsa "6-8" gibi; bilinmiyorsa null. */
  slideCountRange?: string | null;
  toolNamed: boolean;
  evidenceReadiness: EvidenceReadiness;
};

export type ReelsCreativeInput = {
  hook: string;
  script: string;
  timeline: unknown[];
  scenePlan: unknown[];
  screenRecordingPlan: unknown[];
  voiceover: string;
  cover: string;
  cta: string;
  caption: string;
  hashtags: string[];
  toolNamed: boolean;
  evidenceReadiness: EvidenceReadiness;
};

function parseRange(raw: string): { min: number; max: number } | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const max = Number(m[2]);
  return min >= 1 && max >= min ? { min, max } : null;
}

function finalize(issues: CreativeIssue[]): CreativeReadiness {
  const blocked = issues.some((i) => i.code.startsWith("blocked_"));
  return {
    status: blocked ? "blocked" : issues.length > 0 ? "needs_edit" : "ready_for_review",
    issues,
  };
}

/** Araç adlı içerik kanıtsız ONAYLANAMAZ (site doğrulaması ≠ editoryal onay; ama ön koşuldur). */
function evidenceIssues(toolNamed: boolean, evidence: EvidenceReadiness): CreativeIssue[] {
  if (!toolNamed) return [];
  if (evidence === "not_ready") {
    return [
      {
        code: "blocked_tool_evidence",
        message: "Adlandırılmış araç doğrulanamadı — kanıt olmadan editoryal onay verilemez.",
      },
    ];
  }
  if (evidence === "needs_verify") {
    return [
      { code: "stale_evidence", message: "Araç kanıtının süresi geçmiş — yeniden doğrulama gerekli." },
    ];
  }
  return [];
}

export function computeCarouselCreativeReadiness(input: CarouselCreativeInput): CreativeReadiness {
  const issues: CreativeIssue[] = [];

  if (input.cover.trim() === "") issues.push({ code: "empty_cover", message: "Kapak boş." });
  if (input.caption.trim() === "") issues.push({ code: "empty_caption", message: "Caption boş." });
  if (input.slides.length === 0) {
    issues.push({ code: "empty_slides", message: "Slayt yok." });
  } else {
    const contiguous = input.slides.every((s, i) => s.n === i + 1);
    if (!contiguous) {
      issues.push({ code: "slide_numbering", message: "Slayt numaraları 1'den ardışık olmalı." });
    }
    for (const s of input.slides) {
      if (s.copy.trim() === "") {
        issues.push({ code: "empty_slide_copy", message: `Slayt ${s.n} boş.` });
        continue;
      }
      const words = s.copy.trim().split(/\s+/).filter(Boolean).length;
      if (words > SLIDE_WORD_LIMIT) {
        issues.push({
          code: "slide_word_limit",
          message: `Slayt ${s.n} ${words} kelime (limit ${SLIDE_WORD_LIMIT}).`,
        });
      }
    }
    if (input.slideCountRange) {
      const range = parseRange(input.slideCountRange);
      if (range && (input.slides.length < range.min || input.slides.length > range.max)) {
        issues.push({
          code: "slide_count_out_of_range",
          message: `Slayt sayısı ${input.slides.length}, seri aralığı ${input.slideCountRange}.`,
        });
      }
    }
  }
  if (input.hashtags.length > 30) {
    issues.push({ code: "hashtag_overflow", message: "30'dan fazla hashtag." });
  }

  const allText = [input.cover, ...input.slides.map((s) => s.copy), input.caption].join("\n");
  const hasUsableEvidence = input.toolNamed && input.evidenceReadiness === "ready";
  if (!hasUsableEvidence && UNVERIFIED_CLAIM_RE.test(allText)) {
    issues.push({
      code: "blocked_unverified_claim",
      message: "Kanıt olmadan fiyat/ücretsiz/istatistik iddiası — düzenlenmeden onaylanamaz.",
    });
  }
  issues.push(...evidenceIssues(input.toolNamed, input.evidenceReadiness));

  return finalize(issues);
}

export function computeReelsCreativeReadiness(input: ReelsCreativeInput): CreativeReadiness {
  const issues: CreativeIssue[] = [];

  const required: Array<[keyof ReelsCreativeInput, string, string]> = [
    ["hook", "empty_hook", "Hook boş."],
    ["script", "empty_script", "Senaryo boş."],
    ["voiceover", "empty_voiceover", "Voiceover boş."],
    ["cover", "empty_cover", "Kapak boş."],
    ["cta", "empty_cta", "CTA boş."],
    ["caption", "empty_caption", "Caption boş."],
  ];
  for (const [key, code, message] of required) {
    if (String(input[key] ?? "").trim() === "") issues.push({ code, message });
  }
  if (input.timeline.length === 0) {
    issues.push({ code: "empty_timeline", message: "Timeline boş." });
  }
  if (input.scenePlan.length === 0) {
    issues.push({ code: "empty_scene_plan", message: "Sahne planı boş." });
  }
  if (input.toolNamed && input.screenRecordingPlan.length === 0) {
    issues.push({
      code: "missing_screen_plan",
      message: "Araçlı içerik için ekran kaydı planı eksik.",
    });
  }
  if (input.hashtags.length > 30) {
    issues.push({ code: "hashtag_overflow", message: "30'dan fazla hashtag." });
  }

  const allText = [input.hook, input.script, input.voiceover, input.caption].join("\n");
  const hasUsableEvidence = input.toolNamed && input.evidenceReadiness === "ready";
  if (!hasUsableEvidence && UNVERIFIED_CLAIM_RE.test(allText)) {
    issues.push({
      code: "blocked_unverified_claim",
      message: "Kanıt olmadan fiyat/ücretsiz/istatistik iddiası — düzenlenmeden onaylanamaz.",
    });
  }
  issues.push(...evidenceIssues(input.toolNamed, input.evidenceReadiness));

  return finalize(issues);
}
