/**
 * Chart color palette — mirrors the --chart-* CSS variables in globals.css.
 * recharts renders SVG attributes that cannot read CSS custom properties,
 * so chart series must pull their colors from this JS module instead.
 */
export const chartColors = {
  primary: "#8b5cf6", // purple (brand / chart-1)
  secondary: "#22c7f2", // cyan (info / chart-2)
  tertiary: "#18d989", // green (positive / chart-3)
  quaternary: "#ff5538", // orange (action / chart-4)
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.36)",
  tooltipBg: "#1d1d20",
  tooltipBorder: "rgba(255,255,255,0.09)",
} as const;

export type ChartColorKey = keyof typeof chartColors;
