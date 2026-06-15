"use client";

type ToggleProps = {
  checked: boolean;
  onChange: (v: boolean) => void;
  size?: "sm" | "md";
};

/** Token-driven switch — off track/thumb artık sabit renk değil (audit). */
export default function Toggle({ checked, onChange, size = "md" }: ToggleProps) {
  const w = size === "sm" ? 32 : 36;
  const h = size === "sm" ? 18 : 20;
  const thumb = size === "sm" ? 14 : 16;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: h / 2,
        background: checked ? "var(--accent)" : "var(--border-strong)",
        border: "none",
        cursor: "pointer",
        transition: "background 0.2s var(--ease-out)",
        padding: 0,
        flexShrink: 0,
        boxShadow: checked ? "var(--shadow-accent)" : "var(--highlight-top)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: (h - thumb) / 2,
          left: checked ? w - thumb - (h - thumb) / 2 : (h - thumb) / 2,
          width: thumb,
          height: thumb,
          borderRadius: "50%",
          background: checked ? "var(--accent-fg)" : "var(--text-secondary)",
          transition: "left 0.2s var(--ease-out), background 0.2s",
        }}
      />
    </button>
  );
}
