"use client";

import type { ReactNode } from "react";

type Tone = "up" | "down" | "neutral";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: Tone;
  icon?: ReactNode;
  /** Premium hero stat: büyük display sayı + accent vurgusu + gradyan yüzey. */
  accent?: boolean;
  /** "md" (varsayılan, kompakt) | "lg" (hero stat). */
  size?: "md" | "lg";
  /** 0-100 → icon slotunda dairesel ilerleme halkası (lg). */
  progress?: number;
  /** Halka rengi (varsayılan amber ikincil accent). */
  ringTone?: "accent" | "accent-2";
};

const TONE_COLOR: Record<Tone, string> = {
  up: "var(--green)",
  down: "var(--danger)",
  neutral: "var(--text-secondary)",
};

/** Dairesel ilerleme halkası — saf SVG, bağımlılık yok. */
function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const size = 48;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="var(--text-primary)"
      >
        {Math.round(clamped)}
      </text>
    </svg>
  );
}

/** KPI bloğu — kompakt (md) veya premium hero stat (lg + accent + progress ring). */
export default function MetricCard({
  label,
  value,
  delta,
  deltaTone = "neutral",
  icon,
  accent = false,
  size = "md",
  progress,
  ringTone = "accent-2",
}: MetricCardProps) {
  const isLg = size === "lg";
  const showRing = isLg && typeof progress === "number";
  const ringColor = ringTone === "accent" ? "var(--accent)" : "var(--accent-2)";
  return (
    <div
      style={{
        background: accent
          ? "var(--gradient-accent), var(--bg-surface)"
          : "var(--gradient-surface), var(--bg-surface)",
        border: `1px solid ${accent ? "var(--accent-border)" : "var(--border)"}`,
        borderRadius: isLg ? "var(--radius-2xl)" : "var(--radius-xl)",
        padding: isLg ? "22px 24px" : "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: isLg ? 12 : 8,
        boxShadow: isLg
          ? `${accent ? "var(--shadow-accent)" : "var(--shadow-sm)"}, var(--highlight-top)`
          : "var(--highlight-top)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        {showRing ? (
          <ProgressRing pct={progress as number} color={ringColor} />
        ) : icon ? (
          <span style={{ color: accent ? "var(--accent-text)" : "var(--text-muted)", display: "inline-flex" }}>
            {icon}
          </span>
        ) : null}
      </div>
      <div
        className={isLg ? "font-display" : undefined}
        style={{
          fontFamily: isLg ? "var(--font-display)" : undefined,
          fontSize: isLg ? "var(--text-4xl)" : "var(--text-xl)",
          fontWeight: 800,
          color: accent ? "var(--accent-text)" : "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          letterSpacing: isLg ? "-0.02em" : undefined,
        }}
      >
        {value}
      </div>
      {delta && (
        <span style={{ fontSize: "var(--text-xs)", color: TONE_COLOR[deltaTone], fontWeight: 600 }}>
          {delta}
        </span>
      )}
    </div>
  );
}
