"use client";

import type { ReactNode } from "react";
import Card from "./Card";

export type KanbanTone = "accent" | "accent2" | "danger" | "green" | "yellow" | "blue" | "muted";

const TONES: Record<KanbanTone, { bg: string; text: string; border: string; dot: string }> = {
  accent: { bg: "var(--accent-dark)", text: "var(--accent-text)", border: "var(--accent-border)", dot: "var(--accent)" },
  accent2: { bg: "var(--accent-2-dark)", text: "var(--accent-2-text)", border: "var(--accent-2-border)", dot: "var(--accent-2)" },
  danger: { bg: "rgba(190,18,60,0.12)", text: "var(--danger)", border: "rgba(190,18,60,0.26)", dot: "var(--danger)" },
  green: { bg: "rgba(110,141,122,0.16)", text: "var(--green)", border: "rgba(110,141,122,0.3)", dot: "var(--green)" },
  yellow: { bg: "rgba(217,119,87,0.16)", text: "var(--yellow)", border: "rgba(217,119,87,0.3)", dot: "var(--yellow)" },
  blue: { bg: "rgba(91,149,255,0.12)", text: "var(--blue)", border: "rgba(91,149,255,0.26)", dot: "var(--blue)" },
  muted: { bg: "var(--bg-elevated)", text: "var(--text-muted)", border: "var(--border)", dot: "var(--text-muted)" },
};

function Pill({ label, tone = "muted" }: { label: string; tone?: KanbanTone }) {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: "var(--text-2xs)",
        fontWeight: 500,
        color: t.text,
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: "var(--radius-pill)",
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {tone !== "muted" && (
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: t.dot }} />
      )}
      {label}
    </span>
  );
}

function Avatars({ handles }: { handles: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {handles.slice(0, 4).map((h, i) => (
        <span
          key={`${h}-${i}`}
          title={h}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            fontWeight: 500,
            color: "var(--accent-text)",
            background: "var(--accent-dark)",
            border: "1px solid var(--bg-surface)",
            marginLeft: i === 0 ? 0 : -7,
          }}
        >
          {(h || "?").replace(/^@/, "").charAt(0).toUpperCase()}
        </span>
      ))}
    </div>
  );
}

export type KanbanCardProps = {
  priority?: { label: string; tone?: KanbanTone };
  tag?: { label: string; tone?: KanbanTone };
  title: ReactNode;
  meta?: ReactNode;
  progress?: { done: number; total: number };
  avatars?: string[];
  onClick?: () => void;
};

export function KanbanCard({ priority, tag, title, meta, progress, avatars, onClick }: KanbanCardProps) {
  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  return (
    <Card interactive onClick={onClick} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
      {(priority || tag) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {priority && <Pill label={priority.label} tone={priority.tone} />}
          {tag && <Pill label={tag.label} tone={tag.tone} />}
        </div>
      )}
      <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.45 }}>
        {title}
      </div>
      {meta && <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>{meta}</div>}
      {progress && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 5, borderRadius: "var(--radius-pill)", background: "var(--bg-sunken)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: "var(--radius-pill)", transition: "width 0.3s var(--ease-out)" }} />
          </div>
          <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
            {progress.done}/{progress.total}
          </span>
        </div>
      )}
      {avatars && avatars.length > 0 && <Avatars handles={avatars} />}
    </Card>
  );
}

export type KanbanColumnDef<T> = { id: string; label: string; tone?: KanbanTone; items: T[] };

function KanbanColumn<T>({ def, renderCard }: { def: KanbanColumnDef<T>; renderCard: (item: T) => ReactNode }) {
  const t = TONES[def.tone ?? "muted"];
  return (
    <div style={{ flexShrink: 0, width: 304, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4, position: "sticky", top: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.dot }} />
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>{def.label}</span>
        <span
          className="tnum"
          style={{
            fontSize: "var(--text-2xs)",
            color: "var(--text-muted)",
            background: "var(--bg-elevated)",
            borderRadius: "var(--radius-sm)",
            padding: "1px 7px",
          }}
        >
          {def.items.length}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {def.items.length === 0 ? (
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              padding: "16px 12px",
              textAlign: "center",
              border: "1px dashed var(--border)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            Boş
          </div>
        ) : (
          def.items.map(renderCard)
        )}
      </div>
    </div>
  );
}

/** Generic kanban board (read-only; click a card to open its detail elsewhere). */
export function KanbanBoard<T>({
  columns,
  renderCard,
}: {
  columns: KanbanColumnDef<T>[];
  renderCard: (item: T) => ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: "var(--space-4)", overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
      {columns.map((c) => (
        <KanbanColumn key={c.id} def={c} renderCard={renderCard} />
      ))}
    </div>
  );
}
