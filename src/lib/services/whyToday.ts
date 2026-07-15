/**
 * "Neden bugün?" + doğrulama durumu — SAF, yan-etkisiz (Faz 1C). Bir taslağın
 * hangi kaynağa/sinyale dayandığını ve o kaynağın DOĞRULAMA seviyesini türetir.
 *
 * KRİTİK ayrımlar (ADR-017 madde-C, master prompt):
 *  - "kaynak mevcut" ≠ "iddia doğrulandı" → `source_available` ayrı bir durumdur.
 *  - `SourcePost.scannedAt` bir TARAMA zamanıdır, fact-check tarihi DEĞİL.
 *  - "fact-check / doğrulandı" dili YALNIZ `verified` durumunda kullanılır.
 *  - Kart ve drawer AYNI sonucu gösterir (tek kaynak) → tutarlılık.
 *
 * Eşik (`STALE_HOURS`) provisional (ADR-020 açık risk; canlı veriyle ayarlanır).
 */

export type VerificationState =
  | "verified"
  | "partially_verified"
  | "source_available"
  | "unverified"
  | "stale";

export type WhyTodayNewsItem = {
  sourceVerification: string | null; // single_source | official_only | editorial_confirmed | multi_source_confirmed
  whyPeopleCare: string | null;
  title: string | null;
  fetchedAt: Date | string | null;
};

export type WhyTodaySourcePost = {
  scannedAt: Date | string | null; // TARAMA zamanı — fact-check DEĞİL
  publishedAt: Date | string | null;
  url: string | null;
};

export type WhyTodayInput = {
  newsItem: WhyTodayNewsItem | null;
  sourcePost: WhyTodaySourcePost | null;
  /** Saflık/testability için enjekte edilir (Date.now() değil). */
  nowMs: number;
};

export type WhyTodayResult = {
  verification: VerificationState;
  /** Yalnız `verified` iken true — "fact-check" dili yalnız bunda kullanılır. */
  isClaimVerified: boolean;
  /** İnsan-okur kısa özet (kaynak + tazelik); kaynak yoksa null. */
  reason: string | null;
  /** Kaynak yaşı (saat); yoksa null. */
  sourceAgeHours: number | null;
};

const STALE_HOURS = 24; // provisional — günlük içerik için bir günden eski dayanak bayat

const FULL_VERIFICATION = new Set(["multi_source_confirmed", "editorial_confirmed"]);
const PARTIAL_VERIFICATION = new Set(["official_only", "single_source"]);

const STATE_LABELS: Record<VerificationState, string> = {
  verified: "Doğrulandı",
  partially_verified: "Kısmen doğrulandı",
  source_available: "Kaynak mevcut", // ≠ doğrulandı
  unverified: "Doğrulanmadı",
  stale: "Kaynak eski", // güncellik ekseni — readiness'ten AYRI (§8E)
};

export function verificationLabel(state: VerificationState): string {
  return STATE_LABELS[state];
}

/**
 * Güncellik uyarısı (§8E) — readiness'ten AYRI eksen. Readiness "Kontrolleri
 * geçti" olsa bile kaynak eskiyse açık, ayrı bir uyarı gerekir. Kart ve drawer
 * AYNI cümleyi gösterir (tek kaynak). Yalnız `stale`'de dolu; aksi null.
 */
export function freshnessWarning(state: VerificationState): string | null {
  return state === "stale" ? "Kaynak eski; yayınlamadan önce güncelliği kontrol et." : null;
}

function toMs(value: Date | string | null): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function freshnessLabel(hours: number): string {
  if (hours < 1) return "az önce";
  if (hours < 24) return `${Math.round(hours)} saat önce`;
  const days = Math.round(hours / 24);
  return `${days} gün önce`;
}

export function whyToday(input: WhyTodayInput): WhyTodayResult {
  const { newsItem, sourcePost, nowMs } = input;
  const hasSource = Boolean(newsItem || sourcePost);

  // En taze kaynak zaman damgası (news fetchedAt / post scannedAt / publishedAt).
  const stamps = [
    toMs(newsItem?.fetchedAt ?? null),
    toMs(sourcePost?.scannedAt ?? null),
    toMs(sourcePost?.publishedAt ?? null),
  ].filter((x): x is number => x != null);
  const freshest = stamps.length ? Math.max(...stamps) : null;
  const sourceAgeHours = freshest != null ? Math.max(0, (nowMs - freshest) / 3_600_000) : null;

  let verification: VerificationState;
  if (!hasSource) {
    verification = "unverified";
  } else if (sourceAgeHours != null && sourceAgeHours > STALE_HOURS) {
    verification = "stale"; // dayanak eski → içerik artık güncel olmayabilir
  } else if (newsItem?.sourceVerification && FULL_VERIFICATION.has(newsItem.sourceVerification)) {
    verification = "verified";
  } else if (newsItem?.sourceVerification && PARTIAL_VERIFICATION.has(newsItem.sourceVerification)) {
    verification = "partially_verified";
  } else {
    // Kaynak bağlı ama doğrulama sınıflandırması yok → "kaynak mevcut" (doğrulanmadı).
    verification = "source_available";
  }

  const care = newsItem?.whyPeopleCare?.trim() || newsItem?.title?.trim() || null;
  const fresh = sourceAgeHours != null ? freshnessLabel(sourceAgeHours) : null;
  let reason: string | null = null;
  if (hasSource) {
    reason = [care, fresh].filter(Boolean).join(" · ") || "Kaynağa dayalı";
  }

  return {
    verification,
    isClaimVerified: verification === "verified",
    reason,
    sourceAgeHours,
  };
}
