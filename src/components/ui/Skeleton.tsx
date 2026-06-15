"use client";

import type { CSSProperties } from "react";

type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  /** Render N stacked lines instead of a single block. */
  lines?: number;
  style?: CSSProperties;
};

/** Shimmer placeholder. Shimmer is disabled under prefers-reduced-motion (globals.css). */
export default function Skeleton({ width = "100%", height = 14, lines, style }: SkeletonProps) {
  const block = (w: number | string, h: number | string): CSSProperties => ({
    width: w,
    height: h,
    borderRadius: "var(--radius-sm)",
    background:
      "linear-gradient(90deg, var(--bg-elevated) 0%, var(--bg-hover) 50%, var(--bg-elevated) 100%)",
    backgroundSize: "200% 100%",
    animation: "skeleton-shimmer 1.4s ease-in-out infinite",
  });

  if (lines && lines > 1) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} style={block(i === lines - 1 ? "60%" : "100%", height)} />
        ))}
        <style>{SHIMMER_KEYFRAMES}</style>
      </div>
    );
  }

  return (
    <div style={{ ...block(width, height), ...style }}>
      <style>{SHIMMER_KEYFRAMES}</style>
    </div>
  );
}

const SHIMMER_KEYFRAMES = `@keyframes skeleton-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
