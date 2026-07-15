/**
 * Chart color palette — mirrors the --chart-* CSS variables in globals.css.
 * recharts renders SVG attributes that cannot read CSS custom properties,
 * so chart series must pull their colors from this JS module instead.
 *
 * DARK EDITORIAL palet (ADR-020): açık terracotta + nötr; dekoratif çoklu-renk
 * yok. Değerler globals.css --chart-* ile birebir eşleşir.
 */
export const chartColors = {
  primary: "#d2703f", // terracotta accent, dark-açık (chart-1)
  secondary: "#918b82", // nötr gri (chart-2)
  tertiary: "#4fb07a", // status-ok yeşil, açık (chart-3)
  quaternary: "#d69a45", // status-warn kehribar, açık (chart-4)
  grid: "rgba(242,239,232,0.07)",
  axis: "rgba(242,239,232,0.34)",
  tooltipBg: "#20242a", // bg-elevated (dark)
  tooltipBorder: "#3a404a", // border-strong (dark)
} as const;

export type ChartColorKey = keyof typeof chartColors;
