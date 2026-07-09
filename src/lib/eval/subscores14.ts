/**
 * 14 alt-skor — deterministik çekirdek + agregasyon (Sprint 7,
 * FINAL-EVALUATION-SPEC §2).
 *
 * İlkeler: "viral olabilir" tek sayı ASLA (kompozit yalnız sıralama için ve
 * daima parçalarla birlikte); #14 Yayına-Hazır VETO kapısıdır (ağırlıklı
 * terim değil); #11 Paylaşım / #12 Tartışma kompozitte CAPLİDİR
 * (bait-kovalamayı yapısal engeller). [J] skorları batched judge'dan gelir
 * (bu modül yalnız agregasyonunu yapar); [D] skorlar saf kod, $0.
 */

export type Subscore14Key =
  | "kaynakGuveni" // 1 [D]
  | "tazelik" // 2 [D]
  | "ilgi" // 3 [D+J]
  | "hesapUyumu" // 4 [J+D]
  | "sesUyumu" // 5 [J+D]
  | "ozgunluk" // 6 [D+J]
  | "bilgiDegeri" // 7 [J]
  | "kancaGucu" // 8 [J+D]
  | "tutma" // 9 [J]
  | "kaydetme" // 10 [J]
  | "paylasim" // 11 [J] — CAPLİ
  | "tartisma" // 12 [J] — CAPLİ + bait vetosu
  | "uretilebilirlik" // 13 [D]
  | "yayinaHazir"; // 14 [D] — VETO

export type Subscores14 = Record<Subscore14Key, number>; // 0-100

/** Kompozit ağırlıkları — council-config lens ağırlıklarıyla tek sözlük
 *  (hook→#8, persona→#5, risk→#12 vetosu, novelty→#6). Toplam 1.0. */
export const SUBSCORE_WEIGHTS: Partial<Record<Subscore14Key, number>> = {
  kaynakGuveni: 0.06,
  tazelik: 0.06,
  ilgi: 0.1,
  hesapUyumu: 0.1,
  sesUyumu: 0.14, // council "persona" lensi
  ozgunluk: 0.1, // council "novelty" lensi
  bilgiDegeri: 0.12,
  kancaGucu: 0.14, // council "hook" lensi
  tutma: 0.08,
  kaydetme: 0.06,
  paylasim: 0.02, // CAP: bait-kovalamaya karşı düşük tavan
  tartisma: 0.02, // CAP
};

/** #11/#12 kompozite en fazla bu skorla girer (üstü kırpılır). */
export const ENGAGEMENT_CAP = 70;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── [D] alt-skorlar ──────────────────────────────────────────────────────────

/** #1 Kaynak Güveni: kaynak tier + corroboration sayısı. */
export function scoreKaynakGuveni(input: {
  sourceTier: "verified" | "known" | "unknown";
  corroborations: number; // aynı iddiayı taşıyan bağımsız kaynak sayısı
}): number {
  const tierBase = input.sourceTier === "verified" ? 70 : input.sourceTier === "known" ? 50 : 25;
  return clamp(tierBase + Math.min(3, input.corroborations) * 10);
}

/** #2 Tazelik: 18 saatlik half-life decay. */
export function scoreTazelik(input: { publishedAtMs: number; nowMs: number }): number {
  const ageHours = Math.max(0, (input.nowMs - input.publishedAtMs) / 3_600_000);
  return clamp(100 * Math.pow(0.5, ageHours / 18));
}

/** #13 Üretilebilirlik: karakter/format/asset bağımlılığı. */
export function scoreUretilebilirlik(input: {
  charCount: number;
  maxChars: number;
  needsImage: boolean;
  imageReady: boolean;
  usedMock: boolean;
}): number {
  if (input.usedMock) return 0; // mock içerik shiplenemez
  let s = 100;
  if (input.charCount > input.maxChars) s -= 50;
  if (input.needsImage && !input.imageReady) s -= 30;
  return clamp(s);
}

/** #14 Yayına Hazır — VETO: leak=0 AND lint pass AND format valid. */
export function scoreYayinaHazir(input: {
  highLeakCount: number;
  lintErrorCount: number;
  formatValid: boolean;
}): number {
  return input.highLeakCount === 0 && input.lintErrorCount === 0 && input.formatValid ? 100 : 0;
}

// ── Agregasyon ───────────────────────────────────────────────────────────────

export type CompositeResult = {
  /** 0-100 sıralama kompoziti; TEK BAŞINA ASLA render edilmez. */
  composite: number;
  /** #14 vetosu düştü mü → çağıran needs_edit'e yönlendirir. */
  vetoed: boolean;
  /** Kompozite kırpılarak giren skorlar (şeffaflık için). */
  cappedInputs: Partial<Record<Subscore14Key, number>>;
};

export function aggregateComposite(scores: Subscores14): CompositeResult {
  const vetoed = scores.yayinaHazir < 100;
  const cappedInputs: Partial<Record<Subscore14Key, number>> = {};

  let sum = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(SUBSCORE_WEIGHTS) as Array<[Subscore14Key, number]>) {
    let v = scores[key];
    if ((key === "paylasim" || key === "tartisma") && v > ENGAGEMENT_CAP) {
      v = ENGAGEMENT_CAP;
      cappedInputs[key] = v;
    }
    sum += v * weight;
    weightTotal += weight;
  }
  const composite = vetoed ? 0 : clamp(sum / weightTotal);
  return { composite, vetoed, cappedInputs };
}

/** Eksik anahtar bırakmayan güvenli kurucu (UI sözleşmesi: 14 anahtar daima var). */
export function buildSubscores14(partial: Partial<Subscores14>): Subscores14 {
  const keys: Subscore14Key[] = [
    "kaynakGuveni", "tazelik", "ilgi", "hesapUyumu", "sesUyumu", "ozgunluk",
    "bilgiDegeri", "kancaGucu", "tutma", "kaydetme", "paylasim", "tartisma",
    "uretilebilirlik", "yayinaHazir",
  ];
  return Object.fromEntries(keys.map((k) => [k, clamp(partial[k] ?? 0)])) as Subscores14;
}
