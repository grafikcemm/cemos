"use client";

import type { ReactNode } from "react";

type EntityCardProps = {
  /** Sol baş ikon/initial tile. */
  avatar?: ReactNode;
  /** Üstte küçük etiket. */
  eyebrow?: ReactNode;
  /** Başlık (handle/başlık). */
  title: ReactNode;
  /** Başlık satırının sağındaki rozetler (durum/skor). */
  badges?: ReactNode;
  /** Ana metin gövdesi. */
  body?: ReactNode;
  /** Skor çubukları/chip'leri. */
  scores?: ReactNode;
  /** Alt sol meta (beğeni/görüntü/tarih). */
  meta?: ReactNode;
  /** Alt sağ aksiyon butonları. */
  actions?: ReactNode;
  onClick?: () => void;
  accent?: boolean;
};

/**
 * Tüm feed/list sayfalarının ortak premium kart yapısı — avatar + başlık + rozet
 * + gövde + skor + meta/aksiyon. Her sayfada tekrarlanan bespoke kartların yerine.
 */
export default function EntityCard({
  avatar,
  eyebrow,
  title,
  badges,
  body,
  scores,
  meta,
  actions,
  onClick,
  accent = false,
}: EntityCardProps) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        padding: "var(--card-pad)",
        background: accent ? "var(--gradient-accent), var(--bg-surface)" : "var(--bg-surface)",
        border: `1px solid ${accent ? "var(--accent-border)" : "var(--border)"}`,
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--highlight-top)",
        cursor: clickable ? "pointer" : "default",
        transition: "transform 0.18s var(--ease-out), box-shadow 0.18s ease, border-color 0.15s",
      }}
      onMouseEnter={
        clickable
          ? (e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "var(--shadow-md), var(--highlight-top)";
              e.currentTarget.style.borderColor = "var(--border-strong)";
            }
          : undefined
      }
      onMouseLeave={
        clickable
          ? (e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "var(--highlight-top)";
              e.currentTarget.style.borderColor = accent ? "var(--accent-border)" : "var(--border)";
            }
          : undefined
      }
    >
      {/* Başlık satırı */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        {avatar}
        <div style={{ minWidth: 0, flex: 1 }}>
          {eyebrow && (
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 3 }}>
              {eyebrow}
            </div>
          )}
          <div
            style={{
              fontSize: "var(--text-md)",
              fontWeight: 500,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
        </div>
        {badges && <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>{badges}</div>}
      </div>

      {body && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{body}</div>
      )}

      {scores}

      {(meta || actions) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            flexWrap: "wrap",
            paddingTop: "var(--space-3)",
            borderTop: "1px solid var(--border-faint)",
          }}
        >
          {meta && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              {meta}
            </div>
          )}
          {actions && <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
        </div>
      )}
    </div>
  );
}

/** Renkli initial avatar tile — handle baş harfinden tutarlı renk. */
export function AvatarTile({ label, size = 36 }: { label: string; size?: number }) {
  const tones = ["var(--blue)", "var(--accent-2-text)", "var(--accent-text)", "var(--yellow)", "var(--green)"];
  const color = tones[label.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-md)",
        background: `color-mix(in srgb, ${color} 16%, var(--bg-elevated))`,
        border: `1px solid color-mix(in srgb, ${color} 36%, transparent)`,
        display: "grid",
        placeItems: "center",
        fontSize: "var(--text-md)",
        fontWeight: 500,
        color,
        flexShrink: 0,
      }}
    >
      {(label[0] ?? "?").toUpperCase()}
    </div>
  );
}
