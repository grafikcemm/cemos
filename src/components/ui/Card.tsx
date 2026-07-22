"use client";

import type { CSSProperties, ReactNode } from "react";

type CardVariant = "default" | "hero" | "feature" | "quiet";

type CardProps = {
  children: ReactNode;
  /** Inner padding (default true → --card-pad). */
  padded?: boolean;
  /** Adds hover affordance + pointer for clickable cards. */
  interactive?: boolean;
  /** Raises surface one level + soft shadow. (legacy → maps to "feature") */
  elevated?: boolean;
  /**
   * Editöryal yüzey tonu (premium grafit):
   * - hero: baskın showcase (radius-2xl, gradient yüzey, yumuşak gölge, iri pad)
   * - feature: yükseltilmiş panel (gradient-surface, iri pad)
   * - quiet: sessiz gömük alt-yüzey (bg-sunken, gölgesiz)
   * - default: standart kart (bg-surface)
   */
  variant?: CardVariant;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
};

type Surface = { background: string; radius: string; pad: string; shadow: string; border: string };

function surfaceFor(variant: CardVariant, elevated: boolean): Surface {
  const v: CardVariant = variant === "default" && elevated ? "feature" : variant;
  switch (v) {
    case "hero":
      return {
        background: "var(--gradient-surface), var(--bg-elevated)",
        radius: "var(--radius-2xl)",
        pad: "var(--card-pad-lg)",
        shadow: "var(--shadow-md), var(--highlight-top)",
        border: "1px solid var(--border-strong)",
      };
    case "feature":
      // Eden: yumuşak katmanlı gölge rest'te; lift hover'da.
      return {
        background: "var(--gradient-surface), var(--bg-elevated)",
        radius: "var(--radius-xl)",
        pad: "var(--card-pad-lg)",
        shadow: "var(--shadow-sm), var(--highlight-top)",
        border: "1px solid var(--border)",
      };
    case "quiet":
      return {
        background: "var(--bg-sunken)",
        radius: "var(--radius-lg)",
        pad: "var(--card-pad)",
        shadow: "none",
        border: "1px solid var(--border)",
      };
    default:
      return {
        background: "var(--bg-surface)",
        radius: "var(--radius-lg)",
        pad: "var(--card-pad)",
        shadow: "var(--shadow-sm), var(--highlight-top)",
        border: "1px solid var(--border)",
      };
  }
}

/**
 * Atomik yüzey bloğu — her ekranın yapı taşı. Token'larla yeniden temalanır.
 * Editöryal: variant ile hiyerarşik derinlik (hero > feature > default > quiet).
 */
export default function Card({
  children,
  padded = true,
  interactive = false,
  elevated = false,
  variant = "default",
  onClick,
  className,
  style,
  "data-testid": dataTestId,
}: CardProps) {
  const liftable = interactive || !!onClick;
  const s = surfaceFor(variant, elevated);
  return (
    <div
      className={className}
      data-testid={dataTestId}
      onClick={onClick}
      style={{
        background: s.background,
        border: s.border,
        borderRadius: s.radius,
        padding: padded ? s.pad : 0,
        boxShadow: s.shadow,
        cursor: liftable ? "pointer" : "default",
        transition: "transform 0.18s var(--ease-out), box-shadow 0.18s ease, border-color 0.15s, background 0.15s",
        willChange: liftable ? "transform" : undefined,
        ...style,
      }}
      onMouseEnter={
        liftable
          ? (e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "var(--shadow-md), var(--highlight-top)";
              e.currentTarget.style.borderColor = "var(--border-strong)";
            }
          : undefined
      }
      onMouseLeave={
        liftable
          ? (e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = s.shadow;
              e.currentTarget.style.borderColor = s.border.replace("1px solid ", "");
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
