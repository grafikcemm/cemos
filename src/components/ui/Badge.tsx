"use client";

type BadgeVariant =
  | "default"
  | "accent"
  | "muted"
  | "blue"
  | "yellow"
  | "red"
  | "danger"
  | "success";

type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "xs" | "sm";
};

const VARIANTS: Record<BadgeVariant, { bg: string; color: string; border?: string }> = {
  default: { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  accent: { bg: "var(--accent-dark)", color: "var(--accent-text)", border: "var(--accent-border)" },
  muted: { bg: "var(--bg-elevated)", color: "var(--text-muted)", border: "var(--border)" },
  blue: {
    bg: "color-mix(in srgb, var(--status-info) 12%, transparent)",
    color: "var(--blue)",
    border: "color-mix(in srgb, var(--status-info) 26%, transparent)",
  },
  yellow: {
    bg: "color-mix(in srgb, var(--status-warn) 12%, transparent)",
    color: "var(--yellow)",
    border: "color-mix(in srgb, var(--status-warn) 26%, transparent)",
  },
  red: {
    bg: "color-mix(in srgb, var(--status-error) 12%, transparent)",
    color: "var(--danger)",
    border: "color-mix(in srgb, var(--status-error) 26%, transparent)",
  },
  danger: {
    bg: "color-mix(in srgb, var(--status-error) 12%, transparent)",
    color: "var(--danger)",
    border: "color-mix(in srgb, var(--status-error) 26%, transparent)",
  },
  success: {
    bg: "color-mix(in srgb, var(--status-ok) 12%, transparent)",
    color: "var(--green)",
    border: "color-mix(in srgb, var(--status-ok) 26%, transparent)",
  },
};

export default function Badge({ children, variant = "default", size = "xs" }: BadgeProps) {
  const v = VARIANTS[variant] || VARIANTS.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        background: v.bg,
        color: v.color,
        border: v.border ? `1px solid ${v.border}` : "none",
        borderRadius: "var(--radius-sm)",
        padding: size === "xs" ? "2px 6px" : "3px 8px",
        fontSize: size === "xs" ? 9 : 10,
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
