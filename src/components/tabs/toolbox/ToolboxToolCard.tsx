"use client";

import { useState } from "react";
import {
  Star,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Gauge,
  Loader2,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { type Tool, ACCOUNTS, reliabilityColor, linkColor } from "./types";
import { safeExternalHref } from "@/lib/utils/url";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Site favicon (Google s2) with an initial-tile fallback on load failure. */
function Favicon({ url, title, size = 32 }: { url: string; title: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(url);
  const initial = (title || host || "?").trim().charAt(0).toUpperCase();
  const showImg = host.length > 0 && !failed;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-sm)",
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          alt=""
          width={size - 12}
          height={size - 12}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ display: "block", borderRadius: 4 }}
        />
      ) : (
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--accent-text)" }}>{initial}</span>
      )}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginBottom: 4 }}>
      {children}
    </div>
  );
}

const genBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  minHeight: "var(--control-h-sm)",
  padding: "0 8px",
  background: "var(--gradient-accent-2), var(--accent-2-dark)",
  border: "1px solid var(--accent-2-border)",
  color: "var(--accent-2-text)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-2xs)",
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  flex: 1,
  transition: "border-color 0.15s var(--ease-out)",
};

/**
 * Toolbox feature card (Eden + mockup-1 grammar): favicon tile leads the header,
 * then "Bu kaynak ne?" / "Bundan ne üretebilirim?" + meta footer + üret butonları.
 */
export default function ToolboxToolCard({
  tool: t,
  favBusy,
  onToggleFavorite,
  generatingKey,
  onGenerate,
}: {
  tool: Tool;
  favBusy: boolean;
  onToggleFavorite: () => void;
  generatingKey: string | null;
  onGenerate: (id: string, account: string) => void;
}) {
  return (
    <Card interactive style={{ display: "flex", flexDirection: "column", gap: 8, padding: 13 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <Favicon url={t.url} title={t.title} />
        <a
          href={safeExternalHref(t.url)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "flex-start",
            gap: 6,
            flex: 1,
            minWidth: 0,
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            color: "var(--text-primary)",
            textDecoration: "none",
            lineHeight: 1.4,
            letterSpacing: "-0.01em",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
          <ExternalLink size={13} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }} />
        </a>
        <button
          onClick={onToggleFavorite}
          disabled={favBusy}
          title={t.isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          style={{
            background: "none",
            border: "none",
            cursor: favBusy ? "wait" : "pointer",
            color: t.isFavorite ? "var(--accent-text)" : "var(--text-muted)",
            padding: 0,
            lineHeight: 1,
            display: "inline-flex",
            flexShrink: 0,
            transition: "color 0.15s var(--ease-out)",
          }}
        >
          <Star size={15} strokeWidth={2} fill={t.isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      {t.description && (
        <div>
          <Kicker>Bu kaynak ne?</Kicker>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{t.description}</div>
        </div>
      )}

      {t.useCase && (
        <div>
          <Kicker>Bundan ne üretebilirim?</Kicker>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: "var(--text-2xs)",
              fontWeight: 500,
              color: "var(--accent-2-text)",
              background: "var(--gradient-accent-2), var(--accent-2-dark)",
              padding: "3px 8px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--accent-2-border)",
            }}
          >
            <Sparkles size={12} strokeWidth={2} />
            {t.useCase}
          </span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          borderTop: "1px solid var(--border-faint)",
          paddingTop: 8,
          marginTop: "auto",
        }}
      >
        <Badge variant="muted" size="xs">
          {t.category}
        </Badge>
        {t.platform && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{t.platform}</span>}
        <span
          title={`Güven: ${t.sourceReliability}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: "var(--text-2xs)",
            fontWeight: 500,
            color: reliabilityColor(t.sourceReliability),
          }}
        >
          <ShieldCheck size={13} strokeWidth={2} />
          {t.sourceReliability}
        </span>
        <span
          title={`Bağlantı: ${t.linkStatus ?? "bilinmiyor"}`}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: linkColor(t.linkStatus),
            boxShadow: `0 0 0 3px color-mix(in srgb, ${linkColor(t.linkStatus)} 20%, transparent)`,
          }}
        />
        {t.xValueScore > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "var(--text-2xs)",
              fontWeight: 500,
              color: "var(--accent-text)",
              marginLeft: "auto",
            }}
          >
            <Gauge size={13} strokeWidth={2} />
            DEĞER <span className="tnum">{t.xValueScore}</span>
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ACCOUNTS.map((acc) => {
          const busy = generatingKey === `${t.id}-${acc}`;
          return (
            <button key={acc} onClick={() => onGenerate(t.id, acc)} disabled={!!generatingKey} style={genBtnStyle}>
              {busy ? <Loader2 size={12} strokeWidth={2} className="spin" /> : <Sparkles size={12} strokeWidth={2} />}
              {busy ? "…" : `Fikir → ${acc}`}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
