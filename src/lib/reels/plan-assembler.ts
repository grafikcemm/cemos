/**
 * Aylık plan assembler'ı (Sprint 6 + Phase 3E derinleştirme — ADR-039 §6).
 *
 * SAF, deterministik TS — LLM YOK, Date.now/random YOK (girdi tam belirler):
 *  - Ayın GERÇEK gün sayısı doğrulanır (Şubat 30/31 reddedilir).
 *  - Pillar'lar: 3-5 içerik sütunu, her slot etiketli.
 *  - Mix: ~%60 evergreen / %25 seasonal / %15 reactive, ± tolerans (yeni slotlar
 *    üzerinden; matematiksel olarak imkânsızsa dürüst uyarı).
 *  - Korunan slotlar (dossier bağlı / drafted / done / handoff / kullanıcı-eklemesi)
 *    günleri yeni base slot üretiminde HESABA KATILIR — üzerine bindirilmez.
 *  - Çok boyutlu tekrar histogramı (pillar/seri/konu/araç/hook) — yeni slotlar +
 *    yakın geçmiş (mevcut ay + ~90 gün + seri pastTopics). UYARI, blok değil.
 *  - bannedRepetition EXACT eşleşme = hard blocker; near-duplicate = uyarı.
 *  - Seri slotları SeriesProfile'dan genişletilir (format sabit, bölüm değişir);
 *    seri adı/pillar client truth DEĞİL — çağıran DB'den çözer.
 *  - Ham seriesKey kullanıcı başlığı olamaz (topicHint görünen ad taşır).
 */

import { daysInMonth as calendarDaysInMonth } from "@/lib/utils/calendarGrid";
import {
  buildRepetitionHistogram,
  matchesAnyTopic,
  isExactTopicMatch,
  type RepetitionSignal,
  type RepetitionHistogram,
} from "@/lib/reels/repetition";

export type MixBucket = "evergreen" | "seasonal" | "reactive";

export const MIX_TARGET: Record<MixBucket, number> = {
  evergreen: 0.6,
  seasonal: 0.25,
  reactive: 0.15,
};
export const MIX_TOLERANCE = 0.1; // ±10 puan
export const REPETITION_WINDOW = 7; // kayan pencere (slot sayısı)
export const REPETITION_MAX_SAME_PILLAR = 3; // pencere içinde aynı pillar üstü → uyarı

export type SeriesSlotInput = {
  seriesKey: string;
  pillar: string;
  episodesPerMonth: number;
  /** Kullanıcıya görünen seri adı (DB'den çözülür; ham slug değil). */
  displayName?: string;
  /** Seri formatı (carousel|reel...) — uyum doğrulaması çağıranda yapılır. */
  format?: string;
};

/** Korunacak mevcut slotun tekrar/collision için gereken minimal görünümü. */
export type ProtectedSlotInput = {
  dayOfMonth: number;
  pillar?: string;
  seriesKey?: string | null;
  topic?: string;
  toolUrl?: string | null;
  hookShape?: string | null;
};

export type PlanInput = {
  month: string; // "2026-08"
  postDays: number[]; // ayın hangi günleri, sıralı olması gerekmez
  pillars: string[]; // 3-5 sütun
  /** Seri slotları: her seri için ayda kaç bölüm (format önceden tanımlı). */
  series?: SeriesSlotInput[];
  /** Sezonluk konu ipuçları (varsa seasonal slotlara dağıtılır). */
  seasonalTopics?: string[];
  /** Anti-tekrar hafızası (seri pastTopics + geçmiş konular) — near-dup uyarısı. */
  pastTopics?: string[];
  /** Yasaklı tekrarlar — EXACT eşleşme hard-block, near-dup uyarı. */
  bannedRepetition?: string[];
  /** Korunacak mevcut slotlar (günleri yeni base slot üretiminden dışlanır). */
  protectedSlots?: ProtectedSlotInput[];
  /** Yakın geçmiş sinyalleri (histogram için — önceki ay/90 gün özetleri). */
  recentHistory?: RepetitionSignal[];
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
  daysInMonth: number;
  /** Yeni ÜRETİLEN base slotlar (korunan günler hariç). */
  slots: PlanSlot[];
  /** Korunan günler (yeni base slot bindirilmeyen). */
  protectedDays: number[];
  mix: Record<MixBucket, number>; // gerçekleşen oranlar (yeni slotlar üzerinden)
  histogram: RepetitionHistogram;
  warnings: string[];
  /** Hard blocker'lar (apply reddeder) — ör. yasaklı konu tam eşleşmesi. */
  hardBlockers: string[];
};

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

function parseMonthParts(month: string): { year: number; month1: number } {
  const [y, m] = month.split("-").map(Number);
  return { year: y, month1: m };
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
 * Deterministik montaj. Aynı girdi → aynı plan (Date/random YOK). Korunan
 * günler yeni slot üretiminden dışlanır; histogram yeni + geçmiş sinyalleri
 * birlikte değerlendirir.
 */
export function assembleMonthlyPlan(input: PlanInput): AssembledPlan {
  if (input.pillars.length < 3 || input.pillars.length > 5) {
    throw new PlanValidationError(`Pillar sayısı 3-5 olmalı (verilen: ${input.pillars.length})`);
  }
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    throw new PlanValidationError(`Geçersiz ay formatı: ${input.month} (YYYY-MM bekleniyor)`);
  }
  const { year, month1 } = parseMonthParts(input.month);
  if (!Number.isFinite(year) || month1 < 1 || month1 > 12) {
    throw new PlanValidationError(`Geçersiz ay: ${input.month}`);
  }
  const monthDays = calendarDaysInMonth(year, month1);

  const days = [...new Set(input.postDays)].sort((a, b) => a - b);
  if (days.length === 0) throw new PlanValidationError("En az bir yayın günü gerekli");
  if (days.some((d) => d < 1 || d > 31)) {
    throw new PlanValidationError("postDays 1-31 aralığında olmalı");
  }
  // Ayın GERÇEK gün sayısı: Şubat 30/31 gibi imkânsız günler reddedilir.
  const overflow = days.filter((d) => d > monthDays);
  if (overflow.length > 0) {
    throw new PlanValidationError(
      `${input.month} ayında ${overflow.join(", ")}. gün yok (ay ${monthDays} gün)`
    );
  }

  const warnings: string[] = [];
  const hardBlockers: string[] = [];

  // Korunan günler yeni base slot üretiminden dışlanır (üzerine bindirilmez).
  const protectedSlots = input.protectedSlots ?? [];
  const protectedDays = [...new Set(protectedSlots.map((p) => p.dayOfMonth))].sort((a, b) => a - b);
  const protectedSet = new Set(protectedDays);
  const requestedProtected = days.filter((d) => protectedSet.has(d));
  if (requestedProtected.length > 0) {
    warnings.push(
      `${requestedProtected.length} gün zaten korunuyor (${requestedProtected.join(", ")}) — bu günlere yeni base slot eklenmedi.`
    );
  }
  const availableDays = days.filter((d) => !protectedSet.has(d));

  const targets = bucketTargets(availableDays.length);
  const slots: PlanSlot[] = [];

  // 1) Seri slotları önce yerleşir (format önceden tanımlı, bölüm değişir) —
  //    korunmayan günlere eşit aralıklı dağıtılır; seriler evergreen sayılır.
  const seriesQueue: Array<{ seriesKey: string; pillar: string; displayName: string }> = [];
  for (const s of input.series ?? []) {
    for (let i = 0; i < s.episodesPerMonth; i++) {
      seriesQueue.push({ seriesKey: s.seriesKey, pillar: s.pillar, displayName: s.displayName || s.seriesKey });
    }
  }
  if (seriesQueue.length > availableDays.length) {
    warnings.push(
      `Seri bölümü sayısı (${seriesQueue.length}) uygun günden (${availableDays.length}) fazla — fazlası düşürüldü`
    );
    seriesQueue.length = availableDays.length;
  }

  const seriesDayIdx = new Set<number>();
  if (seriesQueue.length > 0 && availableDays.length > 0) {
    const step = availableDays.length / seriesQueue.length;
    for (let i = 0; i < seriesQueue.length; i++) {
      let idx = Math.min(availableDays.length - 1, Math.round(i * step));
      while (seriesDayIdx.has(idx) && idx < availableDays.length - 1) idx++;
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

  for (let i = 0; i < availableDays.length; i++) {
    const dayOfMonth = availableDays[i];
    if (seriesDayIdx.has(i) && seriesCursor < seriesQueue.length) {
      const s = seriesQueue[seriesCursor++];
      slots.push({
        dayOfMonth,
        pillar: s.pillar,
        mixBucket: "evergreen",
        seriesKey: s.seriesKey,
        // Görünen ad (ham slug değil) — UI ham seriesKey göstermez.
        topicHint: `Seri bölümü: ${s.displayName}`,
      });
      continue;
    }
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

  // Seasonal slot sayısı > verilen sezonluk konu → uydurma YOK; dürüst uyarı.
  const seasonalSlotCount = slots.filter((s) => s.mixBucket === "seasonal").length;
  const seasonalProvided = (input.seasonalTopics ?? []).length;
  if (seasonalSlotCount > seasonalProvided) {
    warnings.push(
      `${seasonalSlotCount} seasonal slot var ama ${seasonalProvided} sezonluk konu verildi — kalan seasonal slotlar konu bekliyor (uydurulmadı).`
    );
  }

  // 3) Gerçekleşen mix + tolerans kontrolü (nota yazılır, bloklamaz).
  const mix: Record<MixBucket, number> = { evergreen: 0, seasonal: 0, reactive: 0 };
  for (const s of slots) mix[s.mixBucket]++;
  if (slots.length > 0) {
    for (const b of Object.keys(mix) as MixBucket[]) {
      const ratio = mix[b] / slots.length;
      if (Math.abs(ratio - MIX_TARGET[b]) > MIX_TOLERANCE) {
        warnings.push(
          `Mix sapması: ${b} %${Math.round(ratio * 100)} (hedef %${Math.round(MIX_TARGET[b] * 100)} ±${Math.round(MIX_TOLERANCE * 100)}) — ${slots.length} slotta bu oran matematiksel olarak zor.`
        );
      }
    }
  }

  warnings.push(...repetitionWarnings(slots));

  // 4) Çok boyutlu tekrar histogramı: yeni slotlar + korunan slotlar + geçmiş.
  const signals: RepetitionSignal[] = [
    ...slots.map((s) => ({
      pillar: s.pillar,
      seriesKey: s.seriesKey,
      topic: s.topicHint,
      dayOfMonth: s.dayOfMonth,
      origin: "new" as const,
    })),
    ...protectedSlots.map((p) => ({
      pillar: p.pillar ?? "",
      seriesKey: p.seriesKey ?? null,
      topic: p.topic ?? "",
      toolUrl: p.toolUrl ?? null,
      hookShape: p.hookShape ?? null,
      dayOfMonth: p.dayOfMonth,
      origin: "current_month" as const,
    })),
    ...(input.recentHistory ?? []),
  ];
  const histogram = buildRepetitionHistogram(signals);
  for (const f of histogram.findings) warnings.push(f.message);

  // 5) pastTopics / bannedRepetition kontrolü (niyet edilen konular).
  const intendedTopics = [
    ...(input.seasonalTopics ?? []),
    ...slots.map((s) => s.topicHint).filter((t) => t && !t.startsWith("Gündeme göre") && !t.startsWith("Seri bölümü")),
  ].filter((t) => t.trim() !== "");

  const banned = input.bannedRepetition ?? [];
  const past = input.pastTopics ?? [];
  for (const topic of intendedTopics) {
    const bannedExact = banned.find((b) => isExactTopicMatch(topic, b));
    if (bannedExact) {
      hardBlockers.push(`Yasaklı konu (tam eşleşme): "${topic}" — plan uygulanamaz, konuyu değiştir.`);
      continue;
    }
    const bannedNear = matchesAnyTopic(topic, banned);
    if (bannedNear) {
      warnings.push(`Yasaklı konuya yakın: "${topic}" ≈ "${bannedNear}" — gözden geçir.`);
    }
    const pastNear = matchesAnyTopic(topic, past);
    if (pastNear) {
      warnings.push(`Geçmişte işlenmiş konuya yakın: "${topic}" ≈ "${pastNear}".`);
    }
  }

  return {
    month: input.month,
    daysInMonth: monthDays,
    slots,
    protectedDays,
    mix,
    histogram,
    warnings,
    hardBlockers,
  };
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
