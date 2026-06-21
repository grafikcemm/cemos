"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";
type Intent = "default" | "generate";

type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  /** "generate" → neon-lime "AI üret/oluştur" affordance'ı (tek lime kullanımı). */
  intent?: Intent;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

type SurfaceSpec = { bg: string; color: string; border: string; hover: string };

const SURFACE: Record<Variant, SurfaceSpec> = {
  primary: {
    bg: "var(--accent)",
    color: "var(--accent-fg)",
    border: "var(--accent)",
    hover: "var(--accent-hover)",
  },
  secondary: {
    bg: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "var(--border-strong)",
    hover: "var(--bg-hover)",
  },
  ghost: {
    bg: "transparent",
    color: "var(--text-secondary)",
    border: "transparent",
    hover: "var(--bg-hover)",
  },
  danger: {
    bg: "transparent",
    color: "var(--danger)",
    border: "rgba(244,83,107,0.4)",
    hover: "rgba(244,83,107,0.12)",
  },
};

// Lime "üret" affordance'ı — varianttan bağımsız override.
const GENERATE: SurfaceSpec = {
  bg: "var(--accent-2-dark)",
  color: "var(--accent-2-text)",
  border: "var(--accent-2-border)",
  hover: "rgba(205,253,46,0.2)",
};

export default function Button({
  children,
  variant = "secondary",
  size = "md",
  intent = "default",
  loading = false,
  iconLeft,
  iconRight,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const s = intent === "generate" ? GENERATE : SURFACE[variant];
  const isDisabled = disabled || loading;
  const isPrimary = variant === "primary" && intent === "default";

  return (
    <button
      {...rest}
      disabled={isDisabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: fullWidth ? "100%" : undefined,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        borderRadius: "var(--radius-md)",
        padding: size === "sm" ? "6px 14px" : "9px 18px",
        fontSize: size === "sm" ? "var(--text-xs)" : "var(--text-sm)",
        fontWeight: 600,
        fontFamily: "inherit",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        boxShadow: isPrimary ? "var(--glow-cyan)" : "none",
        transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s, opacity 0.15s",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (isDisabled) return;
        e.currentTarget.style.background = s.hover;
        if (isPrimary) e.currentTarget.style.boxShadow = "var(--shadow-accent)";
      }}
      onMouseLeave={(e) => {
        if (isDisabled) return;
        e.currentTarget.style.background = s.bg;
        e.currentTarget.style.boxShadow = isPrimary ? "var(--glow-cyan)" : "none";
      }}
    >
      {loading ? <span className="spinner" /> : iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
