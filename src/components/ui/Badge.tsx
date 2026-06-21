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
  blue: { bg: "rgba(91,149,255,0.12)", color: "var(--blue)", border: "rgba(91,149,255,0.26)" },
  yellow: { bg: "rgba(245,183,61,0.12)", color: "var(--yellow)", border: "rgba(245,183,61,0.26)" },
  red: { bg: "rgba(244,83,107,0.12)", color: "var(--danger)", border: "rgba(244,83,107,0.26)" },
  danger: { bg: "rgba(244,83,107,0.12)", color: "var(--danger)", border: "rgba(244,83,107,0.26)" },
  success: { bg: "rgba(52,211,153,0.12)", color: "var(--green)", border: "rgba(52,211,153,0.26)" },
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
        fontWeight: 600,
        lineHeight: 1.4,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
