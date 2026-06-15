/**
 * Chart color palette — mirrors the --chart-* CSS variables in globals.css.
 * recharts renders SVG attributes that cannot read CSS custom properties,
 * so chart series must pull their colors from this JS module instead.
 */
export const chartColors = {
  primary: "#9b2c34", // garnet (brand)
  secondary: "#4c8dff", // info blue
  tertiary: "#f5b73d", // warm amber
  quaternary: "#3fb27f", // teal success
  grid: "#262321",
  axis: "#5a5550",
  tooltipBg: "#1a1817",
  tooltipBorder: "#34302d",
} as const;

export type ChartColorKey = keyof typeof chartColors;
