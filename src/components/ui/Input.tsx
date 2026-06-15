"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

type InputProps = {
  invalid?: boolean;
  iconLeft?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

/** Single-line text field matching the dark token surface. */
export default function Input({ invalid = false, iconLeft, style, ...rest }: InputProps) {
  const field = (
    <input
      {...rest}
      style={{
        flex: 1,
        width: "100%",
        background: "var(--bg-base)",
        border: `1px solid ${invalid ? "var(--danger)" : "var(--border-strong)"}`,
        borderRadius: "var(--radius-md)",
        color: "var(--text-primary)",
        padding: iconLeft ? "6px 10px 6px 30px" : "6px 10px",
        fontSize: "var(--text-sm)",
        fontFamily: "inherit",
        outline: "none",
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = invalid ? "var(--danger)" : "var(--accent-border)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = invalid ? "var(--danger)" : "var(--border-strong)";
      }}
    />
  );

  if (!iconLeft) return field;

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
      <span
        style={{
          position: "absolute",
          left: 9,
          display: "inline-flex",
          color: "var(--text-muted)",
          pointerEvents: "none",
        }}
      >
        {iconLeft}
      </span>
      {field}
    </div>
  );
}
