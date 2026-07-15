"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Tek ikon primitive (ADR-021 sadakat). BÜTÜN shell/nav ikonları buradan geçer →
 * tek optik kutu, boyut, stroke ağırlığı, hizalama ve aktif/pasif renk davranışı.
 * Tek aile = Lucide (rounded linecap/join). Ham `<Icon size=.. />` kullanımı
 * yerine `<AppIcon icon={..} />` — karışık boyut/stroke önlenir (theme-icons.test
 * tek-aile kilidi). Emoji/Unicode ikon YASAK.
 */
export type AppIconSize = "sm" | "md" | "lg";

const SIZE_PX: Record<AppIconSize, number> = { sm: 15, md: 18, lg: 20 };

type AppIconProps = {
  icon: LucideIcon;
  /** Optik boyut — sm(15)/md(18, nav varsayılan)/lg(20). */
  size?: AppIconSize;
  /** Renk (default currentColor → satır rengini takip eder). */
  color?: string;
  /** Aktifse accent-text vurgusu (nav ikon). */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
};

// Referans: yumuşak, tutarlı outline. Lucide default 2 biraz sert; 1.75 optik denge.
const STROKE = 1.75;

export default function AppIcon({ icon: Icon, size = "md", color, active, className, style }: AppIconProps) {
  const px = SIZE_PX[size];
  return (
    <Icon
      size={px}
      strokeWidth={STROKE}
      color={active ? "var(--accent-text)" : color}
      aria-hidden
      className={className}
      style={{ flexShrink: 0, display: "block", ...style }}
    />
  );
}
