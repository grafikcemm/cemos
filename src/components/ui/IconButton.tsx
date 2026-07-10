"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "ghost" | "surface" | "danger";
type Size = "sm" | "md";

type IconButtonProps = {
  icon: ReactNode;
  /** Accessible label — required for icon-only controls. */
  label: string;
  variant?: Variant;
  size?: Size;
  active?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">;

const DIM: Record<Size, number> = { sm: 26, md: 32 }; // md = --control-h-sm

export default function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  active = false,
  disabled,
  style,
  ...rest
}: IconButtonProps) {
  const dim = DIM[size];
  const baseBg =
    variant === "surface" ? "var(--bg-elevated)" : active ? "var(--accent-dark)" : "transparent";
  const color =
    variant === "danger"
      ? "var(--danger)"
      : active
        ? "var(--accent-text)"
        : "var(--text-secondary)";

  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: dim,
        height: dim,
        flexShrink: 0,
        background: baseBg,
        color,
        border:
          variant === "surface"
            ? "1px solid var(--border)"
            : active
              ? "1px solid var(--accent-border)"
              : "1px solid transparent",
        borderRadius: "var(--radius-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = "var(--bg-hover)";
          e.currentTarget.style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = baseBg;
          e.currentTarget.style.color = color;
        }
      }}
    >
      {icon}
    </button>
  );
}
