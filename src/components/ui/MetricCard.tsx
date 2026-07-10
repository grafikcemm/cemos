"use client";

import type { ReactNode } from "react";

type Tone = "up" | "down" | "neutral";
type TileTone = "accent" | "blue" | "green" | "lime" | "neutral";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: Tone;
  icon?: ReactNode;
  /** Premium hero stat: gradyan yüzey + accent vurgu. */
  accent?: boolean;
  /** "md" (varsayılan) | "lg" (hero). */
  size?: "md" | "lg";
  /** 0-100 → dairesel ilerleme halkası (lg). */
  progress?: number;
  /** Halka rengi. */
  ringTone?: "accent" | "accent-2";
  /** İkon tile rengi — belirtilmezse accent ise rose, değilse nötr. */
  tone?: TileTone;
};

const TONE_COLOR: Record<Tone, string> = {
  up: "var(--green)",
  down: "var(--danger)",
  neutral: "var(--text-secondary)",
};

const TONE_BG: Record<Tone, string> = {
  up: "color-mix(in srgb, var(--status-ok) 13%, transparent)",
  down: "color-mix(in srgb, var(--status-error) 13%, transparent)",
  neutral: "var(--bg-hover)",
};

const TILE: Record<TileTone, { bg: string; border: string; fg: string }> = {
  accent: { bg: "var(--accent-dark)", border: "var(--accent-border)", fg: "var(--accent-text)" },
  blue: {
    bg: "color-mix(in srgb, var(--status-info) 13%, transparent)",
    border: "color-mix(in srgb, var(--status-info) 28%, transparent)",
    fg: "var(--blue)",
  },
  green: {
    bg: "color-mix(in srgb, var(--status-ok) 13%, transparent)",
    border: "color-mix(in srgb, var(--status-ok) 28%, transparent)",
    fg: "var(--green)",
  },
  lime: { bg: "var(--accent-2-dark)", border: "var(--accent-2-border)", fg: "var(--accent-2-text)" },
  neutral: { bg: "var(--bg-hover)", border: "var(--border)", fg: "var(--text-secondary)" },
};

/** Dairesel ilerleme halkası — saf SVG. */
function ProgressRing({ pct, color, size }: { pct: number; color: string; size: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
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
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--text-primary)">
        {Math.round(clamped)}
      </text>
    </svg>
  );
}

/**
 * KPI kartı — premium yapı: renkli ikon tile + delta rozeti + iri Fraunces sayı.
 * (Curator Pro / Lovable izleği — sadece renk değil, yapı.)
 */
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
  tone,
}: MetricCardProps) {
  const isLg = size === "lg";
  const showRing = isLg && typeof progress === "number";
  const ringColor = ringTone === "accent" ? "var(--accent)" : "var(--accent-2)";
  const tile = TILE[tone ?? (accent ? "accent" : "neutral")];
  const tileSize = isLg ? 48 : 40;

  return (
    <div
      style={{
        position: "relative",
        background: accent ? "var(--gradient-accent), var(--bg-surface)" : "var(--bg-surface)",
        border: `1px solid ${accent ? "var(--accent-border)" : "var(--border)"}`,
        borderRadius: "var(--radius-xl)",
        padding: isLg ? "22px 24px" : "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: isLg ? 18 : 14,
        boxShadow: "var(--highlight-top)",
        overflow: "hidden",
      }}
    >
      {/* Üst satır: ikon tile + delta rozeti / ilerleme halkası */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        {showRing ? (
          <ProgressRing pct={progress as number} color={ringColor} size={tileSize} />
        ) : (
          <div
            style={{
              width: tileSize,
              height: tileSize,
              borderRadius: "var(--radius-md)",
              display: "grid",
              placeItems: "center",
              background: tile.bg,
              border: `1px solid ${tile.border}`,
              color: tile.fg,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
        {delta && (
          <span
            className="tnum"
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              padding: "3px 9px",
              borderRadius: "var(--radius-pill)",
              background: TONE_BG[deltaTone],
              color: TONE_COLOR[deltaTone],
              whiteSpace: "nowrap",
            }}
          >
            {delta}
          </span>
        )}
      </div>

      {/* Alt: label + iri değer */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        <span
          className="font-display tnum"
          style={{
            fontSize: isLg ? "var(--text-4xl)" : "var(--text-3xl)",
            fontWeight: 500,
            color: accent ? "var(--accent-text)" : "var(--text-primary)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
