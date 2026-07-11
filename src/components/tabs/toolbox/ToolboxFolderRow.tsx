"use client";

import {
  Sparkles,
  Palette,
  Briefcase,
  Clapperboard,
  Sprout,
  Wrench,
  Star,
  Folder,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Palette,
  Briefcase,
  Clapperboard,
  Sprout,
  Wrench,
  Star,
};

export type FolderItem = {
  key: string;
  label: string;
  count: number;
  /** lucide-react icon name. */
  icon?: string;
  /** Coral accent (AI bucket / featured). */
  accent2?: boolean;
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  overflowX: "auto",
  paddingBottom: 4,
  scrollbarWidth: "none",
  marginBottom: "var(--space-4)",
};

function FolderTile({
  item,
  active,
  onSelect,
}: {
  item: FolderItem;
  active: boolean;
  onSelect: (k: string) => void;
}) {
  const Icon = ICONS[item.icon ?? ""] ?? Folder;
  const tone = item.accent2 ? "var(--accent-2-text)" : "var(--accent-text)";
  const tileBg = item.accent2 ? "var(--accent-2-dark)" : "var(--accent-dark)";
  const tileBorder = item.accent2 ? "var(--accent-2-border)" : "var(--accent-border)";
  return (
    <button
      onClick={() => onSelect(item.key)}
      aria-pressed={active}
      style={{
        flexShrink: 0,
        minWidth: 128,
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px 7px 8px",
        fontFamily: "inherit",
        background: active ? "var(--gradient-surface), var(--bg-elevated)" : "var(--bg-surface)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
        borderRadius: "var(--radius-md)",
        boxShadow: active ? "var(--shadow-sm), var(--highlight-top)" : "none",
        transition: "border-color .15s var(--ease-out), background .15s, box-shadow .15s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = active ? "var(--accent-border)" : "var(--border)";
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-sm)",
          display: "grid",
          placeItems: "center",
          background: tileBg,
          border: `1px solid ${tileBorder}`,
          color: tone,
          flexShrink: 0,
        }}
      >
        <Icon size={15} strokeWidth={2} fill={item.icon === "Star" ? "currentColor" : "none"} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 500,
            color: "var(--text-primary)",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.label}
        </span>
        <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {item.count} kaynak
        </span>
      </span>
    </button>
  );
}

/** Horizontal folder-shortcut row — the Toolbox's primary bucket selector. */
export default function ToolboxFolderRow({
  items,
  activeKey,
  onSelect,
  loading = false,
}: {
  items: FolderItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div style={rowStyle}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              flexShrink: 0,
              width: 128,
              height: 44,
              borderRadius: "var(--radius-md)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <div style={rowStyle}>
      {items.map((it) => (
        <FolderTile key={it.key} item={it} active={it.key === activeKey} onSelect={onSelect} />
      ))}
    </div>
  );
}
