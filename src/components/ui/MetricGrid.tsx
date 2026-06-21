"use client";

import type { ReactNode } from "react";
import MetricCard from "./MetricCard";

type MetricItem = {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  icon?: ReactNode;
  accent?: boolean;
  size?: "md" | "lg";
  progress?: number;
};

type MetricGridProps = {
  items: MetricItem[];
  /** Sabit kolon sayısı; verilmezse auto-fit minmax(180px,1fr). */
  columns?: number;
};

/** KPI dizisi → responsive MetricCard ızgarası. Tekrarlayan özet satırlarını birleştirir. */
export default function MetricGrid({ items, columns }: MetricGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns
          ? `repeat(${columns}, minmax(0, 1fr))`
          : "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "var(--space-4)",
      }}
    >
      {items.map((m) => (
        <MetricCard
          key={m.label}
          label={m.label}
          value={m.value}
          delta={m.delta}
          deltaTone={m.deltaTone}
          icon={m.icon}
          accent={m.accent}
          size={m.size}
          progress={m.progress}
        />
      ))}
    </div>
  );
}
