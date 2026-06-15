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
    border: "rgba(229,72,77,0.4)",
    hover: "rgba(229,72,77,0.12)",
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
        borderRadius: "var(--radius-md)",
        padding: size === "sm" ? "4px 10px" : "7px 14px",
        fontSize: size === "sm" ? "var(--text-xs)" : "var(--text-sm)",
        fontWeight: 600,
        fontFamily: "inherit",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        transition: "background 0.15s, border-color 0.15s, opacity 0.15s",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) e.currentTarget.style.background = s.hover;
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) e.currentTarget.style.background = s.bg;
      }}
    >
      {loading ? <span className="spinner" /> : iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
