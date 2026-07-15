/**
 * Chart color palette — mirrors the --chart-* CSS variables in globals.css.
 * recharts renders SVG attributes that cannot read CSS custom properties,
 * so chart series must pull their colors from this JS module instead.
 *
 * Açık editorial palet (ADR-017/018): accent terracotta + nötr; dekoratif
 * çoklu-renk yok. Değerler globals.css --chart-* ile birebir eşleşir.
 */
export const chartColors = {
  primary: "#a8481f", // terracotta accent (chart-1)
  secondary: "#726c64", // nötr gri (chart-2)
  tertiary: "#2e7d52", // status-ok yeşil (chart-3)
  quaternary: "#b4740e", // status-warn kehribar (chart-4)
  grid: "rgba(20,18,16,0.08)",
  axis: "rgba(20,18,16,0.36)",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e6e3dc",
} as const;

export type ChartColorKey = keyof typeof chartColors;
