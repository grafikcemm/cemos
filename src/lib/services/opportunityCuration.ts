/**
 * Fırsat kürasyonu (05 §C2) — Plan/Fırsatlar. SAF, deterministik: ham motor
 * sonuçlarını (haber/YouTube/rakip/keşif) birkaç editoryal fırsata indirger.
 * Kullanıcı 60 ham sonuçla karşılaşmaz. LLM kürasyonu Faz 2 — burada yalnız
 * güncellik × uyum × buzz ağırlıklı deterministik sıralama.
 *
 * Bu modül React/DOM/Date bağımsızdır → birim testlenebilir. `ageHours` çağıran
 * tarafça (client) hesaplanıp verilir; skor saf girdiden türetilir.
 */

export type OpportunitySourceKind = "news" | "youtube" | "radar" | "discovery";

export type OpportunityInput = {
  id: string;
  source: OpportunitySourceKind;
  title: string;
  /** "neden şimdi" — kalın gerekçe. */
  whyNow: string;
  /** Gerekçenin devamı (ince). */
  whyNowDetail?: string;
  /** Sağdaki chip metni (buzz/çarpan/kaynak sayısı). */
  badge: string;
  badgeTone?: "accent" | "muted" | "yellow" | "success";
  /** 0-100 buzz/skor (haber/keşif). */
  buzz?: number;
  /** Outlier çarpanı ×N (rakip/trend). */
  multiplier?: number;
  /** Küçük örneklem → çarpan şişirilmez. */
  insufficient?: boolean;
  /** Sinyalin yaşı (saat). */
  ageHours?: number;
  /** Persona/hesap uyumu 0-1 (varsayılan 0.6). */
  personaFit?: number;
  suggestedPlatform: "X" | "Instagram" | "Reels" | "YouTube";
  /** Kaynak platform chip'i. */
  sourcePlatform?: string;
  /** İçerik üretimi/plana/seriye taşınırken kullanılacak konu tohumu. */
  topicSeed: string;
  /** "Ham araştır" hedef advanced ekran id'si; yoksa "" (link gösterilmez). */
  rawTab: string;
  /** Kaynak gönderiye derin bağlantı (rakip outlier → IG post); yoksa gösterilmez. */
  url?: string;
};

export type Opportunity = OpportunityInput & {
  score: number;
  /**
   * Faz 2E (ADR-034 §E): bu fırsatı hangi yöntem sıraladı. "agent" YALNIZ
   * server-side kürasyonda gerçek model çağrısı başarıyla doğrulandığında
   * damgalanır; fallback/lokal sonuç her zaman "deterministic".
   */
  curationMethod?: "agent" | "deterministic";
  /** Agent seçiminin tek-cümlelik gerekçe özeti (varsa). */
  curationReason?: string;
};

export const OPPORTUNITY_SEGMENTS: { value: string; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "news", label: "Haber" },
  { value: "radar", label: "Rakip" },
  { value: "youtube", label: "Trend" },
  { value: "discovery", label: "Keşif" },
];

const SEGMENT_LABEL: Record<OpportunitySourceKind, string> = {
  news: "Haber",
  youtube: "Trend",
  radar: "Rakip",
  discovery: "Keşif",
};

export function opportunitySourceLabel(kind: OpportunitySourceKind): string {
  return SEGMENT_LABEL[kind];
}

const FRESH_WINDOW_HOURS = 72;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Tek fırsatın 0-100 kürasyon skoru: %50 buzz + %30 tazelik + %20 persona uyumu.
 * Yetersiz örneklemli outlier çarpanı buzz'a DÖNÜŞTÜRÜLMEZ (şişirme yok).
 */
export function opportunityScore(o: OpportunityInput): number {
  let buzz = o.buzz;
  if (buzz == null && o.multiplier != null && !o.insufficient) {
    buzz = Math.min(100, o.multiplier * 20);
  }
  const buzzN = clamp01((buzz ?? 40) / 100);
  const freshN = o.ageHours == null ? 0.5 : clamp01(1 - o.ageHours / FRESH_WINDOW_HOURS);
  const personaN = clamp01(o.personaFit ?? 0.6);
  const raw = 0.5 * buzzN + 0.3 * freshN + 0.2 * personaN;
  return Math.round(raw * 100);
}

/**
 * Ham sinyalleri skorla, deterministik sırala, kaynak-başı sınırla, üstten al.
 * Tek motor çok sonuç dökse bile kaynak-başı kap sayesinde çeşitlilik korunur.
 * Sıralama tie-break'i id ile → deterministik (aynı girdi = aynı çıktı).
 */
export function curateOpportunities(
  inputs: OpportunityInput[],
  opts?: { limit?: number; perSourceCap?: number },
): Opportunity[] {
  const limit = opts?.limit ?? 8;
  const perSourceCap = opts?.perSourceCap ?? 4;

  const scored: Opportunity[] = inputs.map((o) => ({ ...o, score: opportunityScore(o) }));
  scored.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const counts: Partial<Record<OpportunitySourceKind, number>> = {};
  const out: Opportunity[] = [];
  for (const o of scored) {
    const c = counts[o.source] ?? 0;
    if (c >= perSourceCap) continue;
    counts[o.source] = c + 1;
    out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}
