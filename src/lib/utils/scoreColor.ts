/**
 * Skor → renk eşlemesi. Tek doğruluk kaynağı — eskiden her tab'da kopyalanan
 * getScoreBadgeColor / getRiskBadgeColor mantığını birleştirir.
 *
 * - Varsayılan (fırsat/yayın skoru): yüksek = iyi.
 * - invert (risk skoru): yüksek = kötü.
 */
export function scoreColor(value: number, opts?: { invert?: boolean }): string {
  if (opts?.invert) {
    if (value >= 70) return "var(--danger)";
    if (value >= 40) return "var(--yellow)";
    return "var(--green)";
  }
  if (value >= 75) return "var(--accent-text)";
  if (value >= 50) return "var(--yellow)";
  return "var(--danger)";
}
