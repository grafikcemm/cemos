/**
 * Aylık plan assembler'ı (Sprint 6 — FINAL-CONTENT-ENGINE-SPEC §6).
 *
 * SAF, deterministik TS — LLM YOK:
 *  - Pillar'lar: 3-5 içerik sütunu, her slot etiketli.
 *  - Mix: ~%60 evergreen / %25 seasonal / %15 reactive, ± tolerans (montajda
 *    zorlanır; sapma nota yazılır).
 *  - Repetition histogram: kayan pencerede aynı pillar/seri yığılması →
 *    UYARI (hard-block değil).
 *  - Seri slotları SeriesProfile'dan genişletilir (format sabit, bölüm
 *    değişir); pastTopics/bannedRepetition çağıran tarafından beslenir.
 *  - Staleness: dossier kanıt expiry'si geçmişse "yeniden doğrula" bayrağı.
 */

export type MixBucket = "evergreen" | "seasonal" | "reactive";

export const MIX_TARGET: Record<MixBucket, number> = {
  evergreen: 0.6,
  seasonal: 0.25,
  reactive: 0.15,
};
export const MIX_TOLERANCE = 0.1; // ±10 puan
export const REPETITION_WINDOW = 7; // kayan pencere (slot sayısı)
export const REPETITION_MAX_SAME_PILLAR = 3; // pencere içinde aynı pillar üstü → uyarı

export type PlanInput = {
  month: string; // "2026-08"
  postDays: number[]; // ayın hangi günleri (1-31), sıralı olması gerekmez
  pillars: string[]; // 3-5 sütun
  /** Seri slotları: her seri için ayda kaç bölüm (format SeriesProfile'da sabit). */
  series?: Array<{ seriesKey: string; pillar: string; episodesPerMonth: number }>;
  /** Sezonluk konu ipuçları (varsa seasonal slotlara dağıtılır). */
  seasonalTopics?: string[];
};

export type PlanSlot = {
  dayOfMonth: number;
  pillar: string;
  mixBucket: MixBucket;
  seriesKey: string | null;
  topicHint: string;
};

export type AssembledPlan = {
  month: string;
  slots: PlanSlot[];
  mix: Record<MixBucket, number>; // gerçekleşen oranlar
  warnings: string[];
};

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

function bucketTargets(total: number): Record<MixBucket, number> {
  // Büyük kalanlar yöntemi: toplam slotu hedef oranlara tam sayı böl.
  const raw: Array<{ bucket: MixBucket; exact: number }> = (
    Object.keys(MIX_TARGET) as MixBucket[]
  ).map((bucket) => ({ bucket, exact: total * MIX_TARGET[bucket] }));
  const floored = raw.map((r) => ({ ...r, n: Math.floor(r.exact) }));
  let remaining = total - floored.reduce((a, r) => a + r.n, 0);
  const byRemainder = [...floored].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (const r of byRemainder) {
    if (remaining <= 0) break;
    r.n += 1;
    remaining -= 1;
  }
  return Object.fromEntries(floored.map((r) => [r.bucket, r.n])) as Record<MixBucket, number>;
}

/** Kayan pencerede pillar yığılması uyarıları (hard-block değil). */
export function repetitionWarnings(slots: PlanSlot[]): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < slots.length; i++) {
    const window = slots.slice(Math.max(0, i - REPETITION_WINDOW + 1), i + 1);
    const counts = new Map<string, number>();
    for (const s of window) counts.set(s.pillar, (counts.get(s.pillar) ?? 0) + 1);
    for (const [pillar, n] of counts) {
      if (n > REPETITION_MAX_SAME_PILLAR) {
        const key = `${pillar}:${slots[i].dayOfMonth}`;
        if (!seen.has(key)) {
          seen.add(key);
          warnings.push(
            `Tekrar uyarısı: "${pillar}" sütunu son ${REPETITION_WINDOW} slotta ${n} kez (gün ${slots[i].dayOfMonth} civarı)`
          );
        }
      }
    }
  }
  return warnings;
}

/**
 * Deterministik montaj. Aynı girdi → aynı plan (Date/random YOK).
 */
export function assembleMonthlyPlan(input: PlanInput): AssembledPlan {
  if (input.pillars.length < 3 || input.pillars.length > 5) {
    throw new PlanValidationError(`Pillar sayısı 3-5 olmalı (verilen: ${input.pillars.length})`);
  }
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    throw new PlanValidationError(`Geçersiz ay formatı: ${input.month} (YYYY-MM bekleniyor)`);
  }
  const days = [...new Set(input.postDays)].sort((a, b) => a - b);
  if (days.length === 0) throw new PlanValidationError("En az bir yayın günü gerekli");
  if (days.some((d) => d < 1 || d > 31)) {
    throw new PlanValidationError("postDays 1-31 aralığında olmalı");
  }

  const warnings: string[] = [];
  const targets = bucketTargets(days.length);
  const slots: PlanSlot[] = [];

  // 1) Seri slotları önce yerleşir (format önceden tanımlı, bölüm değişir) —
  //    eşit aralıklı günlere dağıtılır; seriler evergreen sayılır.
  const seriesQueue: Array<{ seriesKey: string; pillar: string }> = [];
  for (const s of input.series ?? []) {
    for (let i = 0; i < s.episodesPerMonth; i++) {
      seriesQueue.push({ seriesKey: s.seriesKey, pillar: s.pillar });
    }
  }
  if (seriesQueue.length > days.length) {
    warnings.push(
      `Seri bölümü sayısı (${seriesQueue.length}) yayın gününden (${days.length}) fazla — fazlası düşürüldü`
    );
    seriesQueue.length = days.length;
  }

  const seriesDayIdx = new Set<number>();
  if (seriesQueue.length > 0) {
    const step = days.length / seriesQueue.length;
    for (let i = 0; i < seriesQueue.length; i++) {
      let idx = Math.min(days.length - 1, Math.round(i * step));
      while (seriesDayIdx.has(idx) && idx < days.length - 1) idx++;
      while (seriesDayIdx.has(idx) && idx > 0) idx--;
      seriesDayIdx.add(idx);
    }
  }

  // 2) Bucket sayaçları: seriler evergreen'den düşer.
  const remainingByBucket: Record<MixBucket, number> = { ...targets };
  remainingByBucket.evergreen = Math.max(0, remainingByBucket.evergreen - seriesQueue.length);

  const seasonalTopics = [...(input.seasonalTopics ?? [])];
  let pillarCursor = 0;
  let seriesCursor = 0;

  for (let i = 0; i < days.length; i++) {
    const dayOfMonth = days[i];
    if (seriesDayIdx.has(i) && seriesCursor < seriesQueue.length) {
      const s = seriesQueue[seriesCursor++];
      slots.push({
        dayOfMonth,
        pillar: s.pillar,
        mixBucket: "evergreen",
        seriesKey: s.seriesKey,
        topicHint: `Seri bölümü: ${s.seriesKey}`,
      });
      continue;
    }
    // Bucket seçimi: kalan hedefe göre deterministik öncelik (evergreen →
    // seasonal → reactive), tükenen bucket atlanır.
    const order: MixBucket[] = ["evergreen", "seasonal", "reactive"];
    const bucket = order.find((b) => remainingByBucket[b] > 0) ?? "evergreen";
    remainingByBucket[bucket] = Math.max(0, remainingByBucket[bucket] - 1);

    const pillar = input.pillars[pillarCursor % input.pillars.length];
    pillarCursor++;
    const topicHint =
      bucket === "seasonal" && seasonalTopics.length > 0
        ? seasonalTopics.shift()!
        : bucket === "reactive"
          ? "Gündeme göre doldur (reaktif slot)"
          : "";
    slots.push({ dayOfMonth, pillar, mixBucket: bucket, seriesKey: null, topicHint });
  }

  // 3) Gerçekleşen mix + tolerans kontrolü (nota yazılır, bloklamaz).
  const mix: Record<MixBucket, number> = { evergreen: 0, seasonal: 0, reactive: 0 };
  for (const s of slots) mix[s.mixBucket]++;
  for (const b of Object.keys(mix) as MixBucket[]) {
    const ratio = mix[b] / slots.length;
    if (Math.abs(ratio - MIX_TARGET[b]) > MIX_TOLERANCE) {
      warnings.push(
        `Mix sapması: ${b} %${Math.round(ratio * 100)} (hedef %${Math.round(MIX_TARGET[b] * 100)} ±${Math.round(MIX_TOLERANCE * 100)})`
      );
    }
  }

  warnings.push(...repetitionWarnings(slots));
  return { month: input.month, slots, mix, warnings };
}

/**
 * Staleness bayrağı (§6): dossier kanıt expiry'si geçmişse "yeniden doğrula".
 * Ay görünümü açılışında çağrılır; SAF (nowMs enjekte edilir).
 */
export function staleDossierFlags(
  dossiers: Array<{ id: string; title: string; expiry: Date | string | null }>,
  nowMs: number
): Array<{ dossierId: string; title: string; message: string }> {
  return dossiers
    .filter((d) => d.expiry !== null && new Date(d.expiry as Date | string).getTime() < nowMs)
    .map((d) => ({
      dossierId: d.id,
      title: d.title,
      message: "Araç kanıtı bayat — yayınlamadan önce yeniden doğrula",
    }));
}
