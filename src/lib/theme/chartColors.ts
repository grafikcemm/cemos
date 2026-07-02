/**
 * Chart color palette — mirrors the --chart-* CSS variables in globals.css.
 * recharts renders SVG attributes that cannot read CSS custom properties,
 * so chart series must pull their colors from this JS module instead.
 */
export const chartColors = {
  primary: "#b8a8f0", // lavender (brand)
  secondary: "#f0c4a8", // peach (accent-2)
  tertiary: "#8fb8ff", // soft blue (info)
  quaternary: "#7fce9e", // soft green (positive)
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.36)",
  tooltipBg: "#1a1a1e",
  tooltipBorder: "rgba(255,255,255,0.12)",
} as const;

export type ChartColorKey = keyof typeof chartColors;
