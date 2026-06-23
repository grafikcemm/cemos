/**
 * Chart color palette — mirrors the --chart-* CSS variables in globals.css.
 * recharts renders SVG attributes that cannot read CSS custom properties,
 * so chart series must pull their colors from this JS module instead.
 */
export const chartColors = {
  primary: "#c8e0bf", // sage (brand)
  secondary: "#6e8d7a", // forest (positive)
  tertiary: "#d97757", // coral (AI / accent-2)
  quaternary: "#4d6d5a", // sage-muted
  grid: "rgba(255,255,255,0.07)",
  axis: "rgba(255,255,255,0.40)",
  tooltipBg: "#222222",
  tooltipBorder: "rgba(255,255,255,0.15)",
} as const;

export type ChartColorKey = keyof typeof chartColors;
