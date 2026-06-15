"use client";

import type { CSSProperties, ReactNode } from "react";

type CardVariant = "default" | "hero" | "feature" | "quiet";

type CardProps = {
  children: ReactNode;
  /** Inner padding (default true → space-5). */
  padded?: boolean;
  /** Adds hover affordance + pointer for clickable cards. */
  interactive?: boolean;
  /** Raises surface one level + soft shadow. (legacy → maps to "feature") */
  elevated?: boolean;
  /**
   * Editöryal yüzey tonu:
   * - hero: baskın showcase (radius-2xl, gradient-hero, derin gölge, iri pad)
   * - feature: yükseltilmiş panel (gradient-surface + shadow-md)
   * - quiet: sessiz alt-yüzey (bg-base, gölgesiz)
   * - default: standart kart
   */
  variant?: CardVariant;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
};

type Surface = { background: string; radius: string; pad: string; shadow: string; border: string };

function surfaceFor(variant: CardVariant, elevated: boolean): Surface {
  const v: CardVariant = variant === "default" && elevated ? "feature" : variant;
  switch (v) {
    case "hero":
      return {
        background: "var(--gradient-hero), var(--gradient-surface), var(--bg-elevated)",
        radius: "var(--radius-2xl)",
        pad: "var(--space-8)",
        shadow: "var(--shadow-lg), var(--highlight-top)",
        border: "1px solid var(--border-strong)",
      };
    case "feature":
      return {
        background: "var(--gradient-surface), var(--bg-elevated)",
        radius: "var(--radius-xl)",
        pad: "var(--space-5)",
        shadow: "var(--shadow-md), var(--highlight-top)",
        border: "1px solid var(--border)",
      };
    case "quiet":
      return {
        background: "var(--bg-base)",
        radius: "var(--radius-lg)",
        pad: "var(--space-5)",
        shadow: "none",
        border: "1px solid var(--border)",
      };
    default:
      return {
        background: "var(--bg-surface)",
        radius: "var(--radius-xl)",
        pad: "var(--space-5)",
        shadow: "var(--highlight-top)",
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
}: CardProps) {
  const liftable = interactive || !!onClick;
  const s = surfaceFor(variant, elevated);
  return (
    <div
      className={className}
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
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg), var(--highlight-top)";
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
