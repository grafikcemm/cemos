"use client";

import type { SourceMode } from "@/store/xagent";

type ModeSelectorProps = {
  value: SourceMode;
  onChange: (mode: SourceMode) => void;
  size?: "sm" | "md";
};

const MODES: { id: SourceMode; label: string }[] = [
  { id: "ALL", label: "TÜMÜ" },
  { id: "TWEET", label: "TWEET" },
  { id: "QUOTE", label: "QUOTE" },
  { id: "REPLY", label: "YANIT" },
];

export default function ModeSelector({ value, onChange, size = "sm" }: ModeSelectorProps) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {MODES.map((m) => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--accent-fg)" : "var(--text-muted)",
              border: active ? "none" : "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: size === "sm" ? "2px 6px" : "3px 8px",
              fontSize: size === "sm" ? 9 : 10,
              fontWeight: active ? 500 : 400,
              cursor: "pointer",
              letterSpacing: "0.02em",
              transition: "all 0.15s",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
