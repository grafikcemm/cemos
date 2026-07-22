/**
 * Takvim ızgara yardımcıları (05 §C1) — SAF, Date.now bağımsız (yıl/ay girdi
 * olarak verilir → deterministik, birim testlenebilir). Pazartesi-başı 6 haftalık
 * (42 hücre) ay matrisi + Türkçe etiketler + postDays üretimi.
 */

export type CalCell = {
  day: number;
  inMonth: boolean;
  /** -1 önceki ay · 0 bu ay · 1 sonraki ay. */
  monthOffset: -1 | 0 | 1;
  iso: string; // YYYY-MM-DD
};

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** Pazartesi-başı hafta başlıkları. */
export const TR_WEEKDAYS = ["PZT", "SAL", "ÇAR", "PER", "CUM", "CMT", "PAZ"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(year: number, month1: number, day: number): string {
  return `${year}-${pad(month1)}-${pad(day)}`;
}

export function monthLabel(year: number, month1: number): string {
  return `${TR_MONTHS[(month1 - 1 + 12) % 12]} ${year}`;
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/** "YYYY-MM" → { year, month1 }. Geçersizse bugünün ay stringi çağıran tarafça verilir. */
export function parseMonth(month: string): { year: number; month1: number } {
  const [y, m] = month.split("-").map(Number);
  return { year: y || 2026, month1: m || 1 };
}

export function shiftMonth(year: number, month1: number, delta: number): { year: number; month1: number } {
  const zero = (year * 12 + (month1 - 1)) + delta;
  return { year: Math.floor(zero / 12), month1: (zero % 12) + 1 };
}

/**
 * Pazartesi-başlangıçlı 42-hücreli ay matrisi. Önceki/sonraki ayın taşan günleri
 * `inMonth:false` olarak doldurulur (ızgara her zaman 6 tam satır).
 */
export function monthMatrix(year: number, month1: number): CalCell[] {
  const firstDow = new Date(year, month1 - 1, 1).getDay(); // 0=Paz..6=Cmt
  const leading = (firstDow + 6) % 7; // Pazartesi-başı boşluk sayısı
  const thisCount = daysInMonth(year, month1);
  const prev = shiftMonth(year, month1, -1);
  const next = shiftMonth(year, month1, 1);
  const prevCount = daysInMonth(prev.year, prev.month1);

  const cells: CalCell[] = [];

  for (let i = leading - 1; i >= 0; i--) {
    const d = prevCount - i;
    cells.push({ day: d, inMonth: false, monthOffset: -1, iso: isoDate(prev.year, prev.month1, d) });
  }
  for (let d = 1; d <= thisCount; d++) {
    cells.push({ day: d, inMonth: true, monthOffset: 0, iso: isoDate(year, month1, d) });
  }
  let nd = 1;
  while (cells.length < 42) {
    cells.push({ day: nd, inMonth: false, monthOffset: 1, iso: isoDate(next.year, next.month1, nd) });
    nd++;
  }
  return cells;
}

/**
 * "Kaç günde bir" frekansından ayın yayın günlerini üretir (gün 2'den başlar,
 * ay sonuna kadar). Reels plan assembler'ına verilecek postDays.
 */
export function postDaysFromFrequency(everyNDays: number, year: number, month1: number): number[] {
  const total = daysInMonth(year, month1);
  const step = Math.max(1, Math.round(everyNDays));
  const out: number[] = [];
  for (let d = 2; d <= total; d += step) out.push(d);
  return out;
}
