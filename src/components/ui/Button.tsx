"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

const SURFACE: Record<Variant, { bg: string; color: string; border: string; hover: string }> = {
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
    border: "rgba(244,63,94,0.4)",
    hover: "rgba(244,63,94,0.12)",
  },
};

export default function Button({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  iconLeft,
  iconRight,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const s = SURFACE[variant];
  const isDisabled = disabled || loading;

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
        borderRadius: "var(--radius-pill)",
        padding: size === "sm" ? "5px 13px" : "8px 17px",
        fontSize: size === "sm" ? "var(--text-xs)" : "var(--text-sm)",
        fontWeight: 600,
        fontFamily: "inherit",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        boxShadow: variant === "primary" ? "var(--glow-cyan)" : "none",
        transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s, opacity 0.15s",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (isDisabled) return;
        e.currentTarget.style.background = s.hover;
        // Primary: XPatla cyan glow on hover (Genesis: gölge yalnız hover'da).
        if (variant === "primary") e.currentTarget.style.boxShadow = "var(--shadow-accent)";
      }}
      onMouseLeave={(e) => {
        if (isDisabled) return;
        e.currentTarget.style.background = s.bg;
        e.currentTarget.style.boxShadow = variant === "primary" ? "var(--glow-cyan)" : "none";
      }}
    >
      {loading ? <span className="spinner" /> : iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
