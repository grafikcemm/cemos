import { z } from "zod";

/**
 * Deterministik ilham yapısal analizi (Phase 3C §B).
 *
 * Sözleşme (pazarlıksız):
 *  - DB yok, ağ yok, LLM yok — saf fonksiyon, aynı girdi → aynı çıktı.
 *  - ÜCRETSİZ: hiçbir ücretli çağrı tetiklemez/tetikleyemez.
 *  - Kaynak caption/transcript GÜVENİLMEZ VERİDİR: içindeki talimatlar
 *    uygulanmaz (analiz zaten kural tabanlıdır, talimat yürütecek katman yok);
 *    çıktıya ≤80 karakterlik kısa kanıt parçaları dışında rakip metni
 *    yeniden üretilmez.
 *  - Dürüstlük: caption yoksa caption yapısı uydurulmaz; medya pikselleri
 *    analiz EDİLMEZ (media URL bulunması görsel analiz anlamına gelmez);
 *    güvenilir provider outlier kanıtı yoksa "neden çalıştı" değil
 *    "neden çalışabilir / yapısal hipotez" dili kullanılır.
 */

export const INSPIRATION_ANALYSIS_VERSION = "inspiration_structure.v1";

/** "Performansla destekleniyor" diyebilmek için asgari provider çarpanı. */
export const WORKED_MULTIPLIER_MIN = 1.5;

const EVIDENCE_SNIPPET_MAX = 80;

// ── Girdi ──

export const AnalysisProviderOutlierSchema = z.object({
  multiplier: z.number().nullable(),
  insufficient: z.boolean(),
  sampleSize: z.number().int().min(0),
  baselineMedian: z.number().min(0),
  computedAt: z.string().datetime().nullable(),
});
export type AnalysisProviderOutlier = z.infer<typeof AnalysisProviderOutlierSchema>;

export const InspirationAnalysisInputSchema = z.object({
  format: z.enum(["ig_reel", "ig_carousel", "ig_static", "unknown"]),
  caption: z.string().max(10_000).default(""),
  transcript: z.string().max(20_000).default(""),
  userNote: z.string().max(20_000).default(""),
  creatorHandle: z.string().max(60).default(""),
  /** Medya URL'si var mı — piksel analizi YAPILMAZ, yalnız sınırlama satırı üretir. */
  hasMediaUrl: z.boolean().default(false),
  manualMetricsPresent: z.boolean().default(false),
  providerOutlier: AnalysisProviderOutlierSchema.nullable().default(null),
  /** Deterministiklik için dışarıdan verilen zaman damgası. */
  analyzedAt: z.string().datetime(),
});
export type InspirationAnalysisInput = z.infer<typeof InspirationAnalysisInputSchema>;

// ── Çıktı ──

export const HookTypeSchema = z.enum([
  "soru",
  "rakam_liste",
  "iddia",
  "uyari_negatif",
  "nasil_yapilir",
  "merak_bosluğu",
  "dogrudan_hitap",
  "unknown",
]);
export type HookType = z.infer<typeof HookTypeSchema>;

export const CtaTypeSchema = z.enum([
  "takip",
  "kaydet",
  "yorum_anahtar_kelime",
  "paylas",
  "bio_link",
  "profil_ziyaret",
  "soru_yanit",
  "none_detected",
]);
export type CtaType = z.infer<typeof CtaTypeSchema>;

export const PerformanceStatusSchema = z.enum([
  "supported_by_provider_outlier",
  "manual_observation_only",
  "no_reliable_evidence",
]);

export const InspirationStructureAnalysisSchema = z.object({
  analysisVersion: z.literal(INSPIRATION_ANALYSIS_VERSION),
  analyzedAt: z.string().datetime(),
  /** Yalnız girdiden türetilebilen gözlemler (hipotez DEĞİL). */
  observedFacts: z.array(z.string().max(200)).max(24),
  /** Açıkça hipotez olarak etiketlenen yapısal çıkarımlar. */
  structuralHypotheses: z.array(z.string().max(240)).max(16),
  hookType: HookTypeSchema,
  openingMechanism: z.string().max(240).nullable(),
  contentSequence: z.array(z.string().max(120)).max(12),
  captionSequence: z.array(z.string().max(120)).max(12),
  valuePromise: z.object({
    present: z.boolean(),
    evidence: z.string().max(EVIDENCE_SNIPPET_MAX + 20).nullable(),
  }),
  proofOrDemoState: z.enum(["metinde_kanit_iddiasi", "metinde_kanit_yok", "degerlendirilemedi"]),
  ctaType: CtaTypeSchema,
  hashtagStructure: z.object({
    count: z.number().int().min(0),
    placement: z.enum(["trailing_block", "inline", "none"]),
    casing: z.enum(["lower", "mixed", "none"]),
    coreTags: z.array(z.string().max(60)).max(10),
  }),
  lineBreakStructure: z.object({
    paragraphs: z.number().int().min(0),
    usesListFormat: z.boolean(),
    avgLineLength: z.number().min(0),
  }),
  transferablePrinciples: z.array(z.string().max(240)).max(10),
  nonTransferableElements: z.array(z.string().max(240)).max(10),
  copyingRisk: z.object({
    level: z.enum(["low", "medium", "high"]),
    reason: z.string().max(300),
  }),
  performanceAssessment: z.object({
    status: PerformanceStatusSchema,
    /** true = "neden çalıştı" dili kullanılabilir; false = yalnız "çalışabilir". */
    workedClaimAllowed: z.boolean(),
    statement: z.string().max(400),
    multiplier: z.number().nullable(),
    sampleSize: z.number().int().min(0).nullable(),
  }),
  confidence: z.number().min(0).max(1),
  evidenceBasis: z.array(z.string().max(160)).max(10),
  limitations: z.array(z.string().max(240)).max(12),
});
export type InspirationStructureAnalysis = z.infer<typeof InspirationStructureAnalysisSchema>;

// ── Yardımcılar (saf) ──

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

function snippet(s: string): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= EVIDENCE_SNIPPET_MAX ? clean : `${clean.slice(0, EVIDENCE_SNIPPET_MAX)}…`;
}

export function extractHashtags(caption: string): {
  tags: string[];
  placement: "trailing_block" | "inline" | "none";
  casing: "lower" | "mixed" | "none";
  bodyWithoutTrailingBlock: string;
} {
  const tags = caption.match(HASHTAG_RE) ?? [];
  if (tags.length === 0) {
    return { tags: [], placement: "none", casing: "none", bodyWithoutTrailingBlock: caption };
  }
  // Sondaki hashtag bloğu: caption'ın kuyruğu yalnız hashtag/boşluktan oluşuyorsa.
  const trailingMatch = caption.match(/(?:\s*#[\p{L}\p{N}_]+[.,]?\s*)+$/u);
  const trailingBlock = trailingMatch?.[0] ?? "";
  const trailingTags = trailingBlock.match(HASHTAG_RE) ?? [];
  const placement = trailingTags.length === tags.length ? "trailing_block" : "inline";
  const casing = tags.every((t) => t === t.toLowerCase()) ? "lower" : "mixed";
  const bodyWithoutTrailingBlock =
    placement === "trailing_block" ? caption.slice(0, caption.length - trailingBlock.length) : caption;
  return { tags, placement, casing, bodyWithoutTrailingBlock };
}

export function detectHookType(firstLine: string): { hook: HookType; mechanism: string | null } {
  const line = firstLine.trim();
  if (!line) return { hook: "unknown", mechanism: null };
  const lower = line.toLowerCase();
  if (/\?\s*$/.test(line) || /^(neden|nasıl|niye|hiç|why|how|what|did you)\b/i.test(line)) {
    if (/^(nasıl|how)\b/i.test(line) && !/\?/.test(line)) {
      return { hook: "nasil_yapilir", mechanism: `"Nasıl yapılır" girişi: ${snippet(line)}` };
    }
    return { hook: "soru", mechanism: `Soru ile açılış: ${snippet(line)}` };
  }
  if (/^\d+\s*[\p{L}]/u.test(line) || /\b\d+\s+(araç|yol|adım|ipucu|hata|tool|ways|steps|tips|mistakes)\b/iu.test(lower)) {
    return { hook: "rakam_liste", mechanism: `Rakamlı liste vaadi: ${snippet(line)}` };
  }
  if (/^(sakın|asla|yapma|stop|never|don'?t|bunu yapma)/i.test(lower) || /(hata|yanlış|mistake|wrong)/i.test(lower)) {
    return { hook: "uyari_negatif", mechanism: `Uyarı/negatif çerçeve: ${snippet(line)}` };
  }
  if (/^(nasıl|how to)/i.test(lower)) {
    return { hook: "nasil_yapilir", mechanism: `"Nasıl yapılır" girişi: ${snippet(line)}` };
  }
  if (/^(sen|siz|you|eğer|if you)/i.test(lower)) {
    return { hook: "dogrudan_hitap", mechanism: `Doğrudan hitap: ${snippet(line)}` };
  }
  if (/(kimse|sır|gizli|bilmiyor|secret|nobody|no one)/i.test(lower)) {
    return { hook: "merak_bosluğu", mechanism: `Merak boşluğu: ${snippet(line)}` };
  }
  if (/(en iyi|tek|kesin|garanti|best|only|guaranteed|%\d+|\d+x)/i.test(lower)) {
    return { hook: "iddia", mechanism: `Güçlü iddia: ${snippet(line)}` };
  }
  return { hook: "unknown", mechanism: null };
}

export function detectCtaType(text: string): CtaType {
  const lower = text.toLowerCase();
  if (
    /(yorum(?:lara|a)?\s+yaz|yorum\s+yap|comment\s+["'“”]?[\p{L}\p{N}]+["'“”]?)/iu.test(lower) ||
    /yorum(?:lara|a)?\s+["'“”][^"'“”\n]{1,40}["'“”]\s*yaz/iu.test(lower) ||
    /["'“”][^"'“”\n]{1,40}["'“”]\s*yaz(?:ın)?\b/iu.test(lower)
  ) {
    return "yorum_anahtar_kelime";
  }
  if (/(kaydet|save this|kaydetmeyi unutma)/i.test(lower)) return "kaydet";
  if (/(takip et|follow (me|for)|takipte kal)/i.test(lower)) return "takip";
  if (/(paylaş|share this|arkadaşına gönder|send this)/i.test(lower)) return "paylas";
  if (/(bio.?daki link|link in bio|linki bio|profildeki link)/i.test(lower)) return "bio_link";
  if (/(profili? ziyaret|profile göz at|check (my|the) profile)/i.test(lower)) return "profil_ziyaret";
  if (/\?\s*$/.test(text.trim())) return "soru_yanit";
  return "none_detected";
}

export function detectValuePromise(text: string): { present: boolean; evidence: string | null } {
  const patterns: RegExp[] = [
    /(ücretsiz|bedava|free)\b/i,
    /\b\d+\s+(araç|site|yol|adım|ipucu|tool|site|ways|steps|tips)\b/iu,
    /(zaman(ını)? kazan|saves? (you )?time|hızlandır)/i,
    /(öğren(eceksin)?|you('|’)?ll learn|göstereceğim|i('|’)?ll show)/i,
    /(kazandırır|para kazan|make money)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      const start = Math.max(0, m.index - 20);
      return { present: true, evidence: snippet(text.slice(start, m.index + m[0].length + 30)) };
    }
  }
  return { present: false, evidence: null };
}

function classifyCaptionParagraph(p: string, index: number, total: number): string {
  const cta = detectCtaType(p);
  if (index === 0) return "hook satırı";
  if (cta !== "none_detected" && index >= total - 2) return `CTA (${cta})`;
  if (/^([-•*✅✔️→›]|\d+[.)])/u.test(p.trim())) return "liste bloğu";
  return "gövde";
}

function classifyTranscriptSegment(s: string): string {
  const cta = detectCtaType(s);
  if (cta !== "none_detected") return `kapanış/CTA (${cta})`;
  if (/(adım|önce|sonra|step|first|then|next)/i.test(s)) return "adım anlatımı";
  if (/(örneğin|mesela|for example|şöyle|gösteriyorum|ekranda)/i.test(s)) return "gösterim/örnek";
  if (/\?/.test(s)) return "soru/merak";
  return "anlatım";
}

// ── Ana analiz ──

export function analyzeInspirationStructure(rawInput: unknown): InspirationStructureAnalysis {
  const input = InspirationAnalysisInputSchema.parse(rawInput);

  const observedFacts: string[] = [];
  const hypotheses: string[] = [];
  const limitations: string[] = [];
  const evidenceBasis: string[] = [];
  const principles: string[] = [];
  const nonTransferable: string[] = [];

  const hasCaption = input.caption.trim().length > 0;
  const hasTranscript = input.transcript.trim().length > 0;

  // ── Kanıt tabanı (dürüst envanter) ──
  if (hasCaption) evidenceBasis.push("caption (operatör girdisi — API'den çekilmedi)");
  if (hasTranscript) evidenceBasis.push("transcript (operatör girdisi)");
  if (input.userNote.trim()) evidenceBasis.push("operatör notu");
  if (input.manualMetricsPresent) evidenceBasis.push("manuel metrik (operatör gözlemi — Meta metriği değil)");
  if (input.providerOutlier && !input.providerOutlier.insufficient) {
    evidenceBasis.push(`provider outlier (örneklem ${input.providerOutlier.sampleSize})`);
  }

  // ── Zorunlu sınırlamalar ──
  limitations.push("Görsel/video pikselleri analiz edilmedi — tüm çıkarımlar metin girdilerinden.");
  if (input.hasMediaUrl) {
    limitations.push("Medya URL'si kayıtlı olsa da içeriği fetch/analiz edilmedi (scraping yasak).");
  }
  if (!hasCaption) limitations.push("Caption girilmedi — caption yapısı analiz edilemedi (uydurulmadı).");
  if (!hasTranscript) limitations.push("Transcript yok — video/anlatım akışı analiz edilemedi.");
  if (input.format === "unknown") {
    limitations.push("Format doğrulanamadı (URL /p/ formatı carousel ya da statik olabilir).");
  }

  // ── Hashtag + caption yapısı ──
  const hashtag = extractHashtags(input.caption);
  const body = hashtag.bodyWithoutTrailingBlock.trim();
  const paragraphs = body.length > 0 ? body.split(/\n{2,}|\n(?=[-•*✅✔️→›])/).map((p) => p.trim()).filter(Boolean) : [];
  const lines = body.length > 0 ? body.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  const usesListFormat = lines.filter((l) => /^([-•*✅✔️→›]|\d+[.)])/u.test(l)).length >= 2;
  const avgLineLength =
    lines.length > 0 ? Math.round(lines.reduce((a, l) => a + l.length, 0) / lines.length) : 0;

  if (hasCaption) {
    observedFacts.push(`Caption ${input.caption.length} karakter, ${lines.length} satır, ${paragraphs.length} paragraf.`);
    if (hashtag.tags.length > 0) {
      observedFacts.push(
        `${hashtag.tags.length} hashtag (${hashtag.placement === "trailing_block" ? "sonda blok" : "metin içinde"}, ${hashtag.casing}).`
      );
    } else {
      observedFacts.push("Hashtag kullanılmamış.");
    }
    if (usesListFormat) observedFacts.push("Caption liste formatı kullanıyor (madde işaretleri/numaralar).");
  }

  // ── Hook / açılış ──
  const firstLine = hasCaption ? (lines[0] ?? "") : hasTranscript ? input.transcript.split(/[.!?\n]/)[0] ?? "" : "";
  const { hook, mechanism } = detectHookType(firstLine);
  if (hook !== "unknown" && mechanism) {
    observedFacts.push(mechanism);
    hypotheses.push(`Hipotez: ${hook} tipi açılış izleyiciyi ilk saniyede durdurmayı hedefliyor.`);
  }

  // ── CTA ──
  const ctaSource = hasCaption ? input.caption : input.transcript;
  const ctaType = ctaSource ? detectCtaType(ctaSource) : "none_detected";
  if (ctaType !== "none_detected") {
    observedFacts.push(`CTA türü tespit edildi: ${ctaType}.`);
    if (ctaType === "yorum_anahtar_kelime") {
      hypotheses.push("Hipotez: yorum-anahtar-kelime CTA'sı yorum sayısını ve dağıtımı artırma mekanizması.");
    }
  }

  // ── Değer vaadi ──
  const valuePromise = hasCaption || hasTranscript ? detectValuePromise(`${input.caption}\n${input.transcript}`) : { present: false, evidence: null };
  if (valuePromise.present && valuePromise.evidence) {
    observedFacts.push(`Değer vaadi ifadesi: "${valuePromise.evidence}"`);
  }

  // ── Kanıt/demo (yalnız METİN işaretleri — görsel değerlendirilmedi) ──
  let proofOrDemoState: "metinde_kanit_iddiasi" | "metinde_kanit_yok" | "degerlendirilemedi" = "degerlendirilemedi";
  if (hasCaption || hasTranscript) {
    const proofRe = /(ekranda|gösteriyorum|adım adım|kanıt|deniyorum|test ettim|screenshot|i tested|watch me|live demo)/i;
    proofOrDemoState = proofRe.test(`${input.caption} ${input.transcript}`) ? "metinde_kanit_iddiasi" : "metinde_kanit_yok";
  }

  // ── Diziler ──
  const captionSequence = paragraphs.slice(0, 12).map((p, i) => classifyCaptionParagraph(p, i, paragraphs.length));
  if (hasCaption && hashtag.placement === "trailing_block" && captionSequence.length < 12) {
    captionSequence.push("hashtag bloğu");
  }
  const transcriptSegments = hasTranscript
    ? input.transcript.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 10)
    : [];
  const contentSequence = transcriptSegments.slice(0, 12).map(classifyTranscriptSegment);

  // ── Aktarılabilir ilkeler (türetilmiş, jenerik — rakip metni kopyalanmaz) ──
  if (hook === "soru") principles.push("İlk satırda hedef kitlenin gerçek sorusunu sor — kaydırmayı durdurur.");
  if (hook === "rakam_liste") principles.push("Somut sayı vaadi (N araç/adım) beklentiyi netleştirir; içerik sayıyı karşılamalı.");
  if (hook === "uyari_negatif") principles.push("Hata/uyarı çerçevesi kayıp korkusuyla dikkat çeker — abartmadan kullan.");
  if (hook === "nasil_yapilir") principles.push("'Nasıl' girişi arama niyetiyle örtüşür; adımların net olması şart.");
  if (usesListFormat) principles.push("Liste formatı taranabilirliği artırır — her madde tek fikir taşımalı.");
  if (ctaType === "yorum_anahtar_kelime") principles.push("Tek kelimelik yorum CTA'sı etkileşim eşiğini düşürür.");
  if (ctaType === "kaydet") principles.push("Kaydet CTA'sı referans-değeri yüksek içerikte çalışır (liste/rehber).");
  if (hashtag.placement === "trailing_block" && hashtag.tags.length >= 3) {
    principles.push("Hashtag'leri gövdeden ayrık sonda blok halinde tut — okunabilirlik bozulmaz.");
  }
  if (valuePromise.present) principles.push("Açık değer vaadi (ne kazanacağı) ilk 2 satırda verilmeli.");
  if (principles.length === 0 && (hasCaption || hasTranscript)) {
    principles.push("Belirgin şablon tespit edilemedi — yapıdan çok yaratıcı icrası taşıyor olabilir (hipotez).");
  }

  // ── Aktarılamaz öğeler ──
  if (input.creatorHandle) nonTransferable.push(`@${input.creatorHandle} kişisel kimliği/yüzü/ses tonu.`);
  if (hasTranscript) nonTransferable.push("Anlatıcının kişisel hikâyesi ve icra tarzı (metinden kopyalanamaz).");
  nonTransferable.push("Birebir cümle/caption kopyası — yapı aktarılır, ifade kopyalanmaz.");

  // ── Kopyalama riski (deterministik kural) ──
  let riskLevel: "low" | "medium" | "high";
  let riskReason: string;
  if (hasCaption && body.length > 0 && body.length < 150 && !usesListFormat) {
    riskLevel = "high";
    riskReason = "Kısa, tek-vuruşluk caption: değeri ifadenin kendisinde — uyarlama birebir kopyaya kayabilir.";
  } else if (usesListFormat || hook === "rakam_liste" || hook === "nasil_yapilir") {
    riskLevel = "low";
    riskReason = "Formülik yapı (liste/nasıl): şablon kendi içeriğinle doldurulabilir, ifade kopyası gerekmez.";
  } else {
    riskLevel = "medium";
    riskReason = "Yapı kısmen aktarılabilir; cümle düzeyinde benzerlikten kaçın.";
  }

  // ── Performans değerlendirmesi (dürüst dil ayrımı) ──
  const po = input.providerOutlier;
  const outlierSupported =
    po !== null && !po.insufficient && po.multiplier !== null && po.multiplier >= WORKED_MULTIPLIER_MIN;
  let perfStatus: z.infer<typeof PerformanceStatusSchema>;
  let perfStatement: string;
  if (outlierSupported && po) {
    perfStatus = "supported_by_provider_outlier";
    perfStatement = `Performansla destekleniyor: hesap medyanının ${po.multiplier!.toFixed(1)}× üzerinde (örneklem ${po.sampleSize}). Yapısal etkenler bu sonuçla ilişkilendirilebilir — nedensellik yine de kanıtlanmış değil.`;
  } else if (input.manualMetricsPresent) {
    perfStatus = "manual_observation_only";
    perfStatement =
      "Yalnız operatör gözlemi var (manuel metrik) — baseline karşılaştırması yok. 'Neden çalıştı' değil, 'neden çalışabilir' düzeyinde yapısal hipotez sunulur.";
  } else {
    perfStatus = "no_reliable_evidence";
    perfStatement =
      "Güvenilir performans kanıtı yok. Bu analiz yalnız yapısal hipotezdir: içerik ÇALIŞABİLİR, çalıştığı iddia edilmez.";
  }
  if (po && po.insufficient) {
    limitations.push(`Provider outlier örneklemi yetersiz (${po.sampleSize}) — çarpan güvenilir kanıt sayılmadı.`);
  }

  // ── Güven (deterministik toplama) ──
  let confidence = 0.15;
  if (hasCaption) confidence += 0.25;
  if (hasTranscript) confidence += 0.25;
  if (input.format !== "unknown") confidence += 0.1;
  if (outlierSupported) confidence += 0.2;
  else if (input.manualMetricsPresent) confidence += 0.05;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  if (!hasCaption && !hasTranscript) {
    hypotheses.push("Metin girdisi olmadan yapısal hipotez üretilemez — yalnız format/URL düzeyi bilgi var.");
  }

  return InspirationStructureAnalysisSchema.parse({
    analysisVersion: INSPIRATION_ANALYSIS_VERSION,
    analyzedAt: input.analyzedAt,
    observedFacts: observedFacts.slice(0, 24),
    structuralHypotheses: hypotheses.slice(0, 16),
    hookType: hook,
    openingMechanism: mechanism,
    contentSequence,
    captionSequence,
    valuePromise,
    proofOrDemoState,
    ctaType,
    hashtagStructure: {
      count: hashtag.tags.length,
      placement: hashtag.placement,
      casing: hashtag.casing,
      coreTags: hashtag.tags.slice(0, 10).map((t) => t.toLowerCase()),
    },
    lineBreakStructure: {
      paragraphs: paragraphs.length,
      usesListFormat,
      avgLineLength,
    },
    transferablePrinciples: principles.slice(0, 10),
    nonTransferableElements: nonTransferable.slice(0, 10),
    copyingRisk: { level: riskLevel, reason: riskReason },
    performanceAssessment: {
      status: perfStatus,
      workedClaimAllowed: perfStatus === "supported_by_provider_outlier",
      statement: perfStatement,
      multiplier: po?.insufficient ? null : (po?.multiplier ?? null),
      sampleSize: po?.sampleSize ?? null,
    },
    confidence,
    evidenceBasis: evidenceBasis.slice(0, 10),
    limitations: limitations.slice(0, 12),
  });
}
