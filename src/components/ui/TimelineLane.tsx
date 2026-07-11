"use client";

import type { CSSProperties } from "react";

export type TimelineLaneTone = "accent" | "accent-2" | "info" | "ok" | "warn";

export type TimelineLaneItem = {
  id: string;
  day: number;
  title: string;
  tone?: TimelineLaneTone;
  onClick?: () => void;
};

type TimelineLaneProps = {
  label: string;
  items: TimelineLaneItem[];
  daysInMonth: number;
};

const LABEL_WIDTH_PX = 96;
const DAY_CELL_MIN_PX = 30;
const LANE_MIN_HEIGHT_PX = 44;

const TONE_STYLES: Record<TimelineLaneTone, { bg: string; border: string; text: string }> = {
  accent: {
    bg: "var(--accent-tint-15)",
    border: "var(--accent-border)",
    text: "var(--accent-text)",
  },
  "accent-2": {
    bg: "var(--accent-2-dark)",
    border: "var(--accent-2-border)",
    text: "var(--accent-2-text)",
  },
  info: {
    bg: "color-mix(in srgb, var(--status-info) 14%, transparent)",
    border: "color-mix(in srgb, var(--status-info) 30%, transparent)",
    text: "var(--status-info)",
  },
  ok: {
    bg: "color-mix(in srgb, var(--status-ok) 14%, transparent)",
    border: "color-mix(in srgb, var(--status-ok) 30%, transparent)",
    text: "var(--status-ok)",
  },
  warn: {
    bg: "color-mix(in srgb, var(--status-warn) 14%, transparent)",
    border: "color-mix(in srgb, var(--status-warn) 30%, transparent)",
    text: "var(--status-warn)",
  },
};

function pillStyle(tone: TimelineLaneTone, clickable: boolean): CSSProperties {
  const t = TONE_STYLES[tone];
  return {
    display: "block",
    maxWidth: "100%",
    minWidth: 0,
    padding: "2px 6px",
    borderRadius: "var(--radius-sm)",
    background: t.bg,
    border: `1px solid ${t.border}`,
    color: t.text,
    fontSize: "var(--text-2xs)",
    fontFamily: "inherit",
    lineHeight: "14px",
    textAlign: "left",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    cursor: clickable ? "pointer" : "default",
  };
}

/**
 * Timeline/Calendar arketipi — yatay şerit: sol sabit etiket + gün hücreleri
 * üzerinde renk-tonlu kompakt item pill'leri. Yatay taşma KENDİ konteynerinde
 * kayar (sayfa taşmaz); pill tek satır ellipsis + title tooltip.
 */
export default function TimelineLane({ label, items, daysInMonth }: TimelineLaneProps) {
  const byDay = new Map<number, TimelineLaneItem[]>();
  for (const item of items) {
    const day = Math.min(Math.max(1, Math.round(item.day)), daysInMonth);
    const existing = byDay.get(day);
    byDay.set(day, existing ? [...existing, item] : [item]);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        minHeight: LANE_MIN_HEIGHT_PX,
        borderBottom: "1px solid var(--border-faint)",
      }}
    >
      <div
        title={label}
        style={{
          flex: `0 0 ${LABEL_WIDTH_PX}px`,
          width: LABEL_WIDTH_PX,
          display: "flex",
          alignItems: "center",
          padding: "4px var(--space-2) 4px 0",
          fontSize: "var(--text-xs)",
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          borderRight: "1px solid var(--border-faint)",
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${daysInMonth}, minmax(${DAY_CELL_MIN_PX}px, 1fr))`,
            minWidth: daysInMonth * DAY_CELL_MIN_PX,
            height: "100%",
          }}
        >
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dayItems = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                style={{
                  minWidth: 0,
                  padding: "4px 2px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 2,
                  borderLeft: i === 0 ? "none" : "1px solid var(--border-faint)",
                }}
              >
                {dayItems.map((item) => {
                  const tone = item.tone ?? "info";
                  const tooltip = `${day} · ${item.title}`;
                  const content = (
                    <>
                      <span className="tnum" style={{ fontWeight: 600, marginRight: 3 }}>
                        {day}
                      </span>
                      {item.title}
                    </>
                  );
                  return item.onClick ? (
                    <button
                      key={item.id}
                      type="button"
                      onClick={item.onClick}
                      title={tooltip}
                      style={pillStyle(tone, true)}
                    >
                      {content}
                    </button>
                  ) : (
                    <span key={item.id} title={tooltip} style={pillStyle(tone, false)}>
                      {content}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
