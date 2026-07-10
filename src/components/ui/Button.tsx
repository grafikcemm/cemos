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
  // Birincil aksiyon = TURUNCU dolgu (dashboard semantiği: turuncu = aksiyon/üret).
  primary: {
    bg: "var(--accent-2)",
    color: "var(--accent-2-fg)",
    border: "var(--accent-2)",
    hover: "var(--accent-2-hover)",
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
    border: "color-mix(in srgb, var(--danger) 40%, transparent)",
    hover: "color-mix(in srgb, var(--danger) 12%, transparent)",
  },
};

// Turuncu "üret" affordance'ı (AI) — primary'nin tintli/sessiz hâli.
const GENERATE: SurfaceSpec = {
  bg: "var(--accent-2-dark)",
  color: "var(--accent-2-text)",
  border: "var(--accent-2-border)",
  hover: "color-mix(in srgb, var(--accent-2) 20%, transparent)",
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
        borderRadius: "var(--radius-sm)",
        minHeight: size === "sm" ? "var(--control-h-sm)" : "var(--control-h)",
        padding: size === "sm" ? "0 14px" : "0 20px",
        fontSize: size === "sm" ? "var(--text-xs)" : "var(--text-sm)",
        fontWeight: 500,
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
