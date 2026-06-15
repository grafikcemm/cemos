"use client";

import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

type ChartContainerProps = {
  height?: number;
  /** When true, renders the empty slot instead of the chart. */
  empty?: boolean;
  emptyLabel?: string;
  children: ReactNode;
};

/**
 * Standard recharts wrapper. Chart series colors come from src/lib/theme/chartColors.ts
 * (CSS vars can't be read inside SVG attrs), not from this component.
 */
export default function ChartContainer({
  height = 200,
  empty = false,
  emptyLabel = "Veri yok",
  children,
}: ChartContainerProps) {
  if (empty) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "var(--text-sm)",
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}
