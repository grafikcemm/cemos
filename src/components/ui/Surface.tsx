"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Kontrollü açık-ada yüzeyi (referans ADR-021) — koyu kanvas içinde karar/
 * karşılaştırma odağı için ivory (inverse) veya peach ada; ayrıca `blocked`
 * (koyu hata-tint) ve `default` (koyu yüzey) tonları. Her tona ait metin/ikincil/
 * gömük/ayraç renkleri CSS custom-prop olarak KÖKe basılır (`--sf-fg`, `--sf-muted`,
 * `--sf-sunken`, `--sf-border`), böylece çocuk düğümler tonu bilmeden token
 * tüketir. Renk YALNIZ token üzerinden (globals.css) — hardcoded hex yok.
 *
 * Kullanım kuralı (design-quality): her kartı ivory yapma, sayfayı light'a çevirme.
 * Açık ada YALNIZ "Sıradaki" karar kartı (inverse) ve düzenleme-gereken dikkat
 * kartı (peach) gibi odak yüzeyleri için. İkincil/kuyruk satırları koyu kalır.
 */
export type SurfaceTone = "inverse" | "peach" | "blocked" | "default";

type ToneStyle = { bg: string; border: string; fg: string; muted: string; sunken: string };

const TONES: Record<SurfaceTone, ToneStyle> = {
  inverse: {
    bg: "var(--inverse-surface)",
    border: "var(--inverse-border)",
    fg: "var(--inverse-text)",
    muted: "var(--inverse-muted)",
    sunken: "var(--inverse-surface-2)",
  },
  peach: {
    bg: "var(--peach-surface)",
    border: "var(--peach-border)",
    fg: "var(--peach-text)",
    muted: "var(--peach-muted)",
    sunken: "var(--peach-surface-2)",
  },
  blocked: {
    bg: "color-mix(in srgb, var(--status-error) 11%, var(--bg-surface))",
    border: "color-mix(in srgb, var(--status-error) 34%, transparent)",
    fg: "var(--text-primary)",
    muted: "var(--text-secondary)",
    sunken: "var(--bg-sunken)",
  },
  default: {
    bg: "var(--bg-surface)",
    border: "var(--border)",
    fg: "var(--text-primary)",
    muted: "var(--text-secondary)",
    sunken: "var(--bg-sunken)",
  },
};

type SurfaceProps = {
  tone?: SurfaceTone;
  children: ReactNode;
  /** İç padding (default true → --card-pad). */
  padded?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
};

/** Ton renklerini (fg/muted/sunken/border) dışarıya veren yardımcı — kart içi
 * özel kompozisyonlar için (ör. rozet zemini). */
export function surfaceTone(tone: SurfaceTone): ToneStyle {
  return TONES[tone];
}

export default function Surface({
  tone = "default",
  children,
  padded = true,
  onClick,
  className,
  style,
  "data-testid": testid,
}: SurfaceProps) {
  const t = TONES[tone];
  return (
    <div
      className={className}
      onClick={onClick}
      data-testid={testid}
      data-surface-tone={tone}
      style={{
        // Çocukların tonu bilmeden tüketmesi için:
        ["--sf-fg" as string]: t.fg,
        ["--sf-muted" as string]: t.muted,
        ["--sf-sunken" as string]: t.sunken,
        ["--sf-border" as string]: t.border,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        borderRadius: "var(--radius-lg)",
        padding: padded ? "var(--card-pad)" : 0,
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function InverseCard(props: Omit<SurfaceProps, "tone">) {
  return <Surface tone="inverse" {...props} />;
}

export function PeachCard(props: Omit<SurfaceProps, "tone">) {
  return <Surface tone="peach" {...props} />;
}
