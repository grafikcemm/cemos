/**
 * Chart color palette — mirrors the --chart-* CSS variables in globals.css.
 * recharts renders SVG attributes that cannot read CSS custom properties,
 * so chart series must pull their colors from this JS module instead.
 */
export const chartColors = {
  primary: "#e11d48", // cyan (brand)
  secondary: "#4c8dff", // info blue
  tertiary: "#cdfd2e", // neon lime
  quaternary: "#f43f5e", // rose
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.40)",
  tooltipBg: "#1d1d1d",
  tooltipBorder: "rgba(255,255,255,0.15)",
} as const;

export type ChartColorKey = keyof typeof chartColors;
