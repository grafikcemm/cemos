"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

type InputProps = {
  invalid?: boolean;
  iconLeft?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

/** Single-line text field — gömük (sunken) yüzey + accent focus ring. */
export default function Input({ invalid = false, iconLeft, style, ...rest }: InputProps) {
  const field = (
    <input
      {...rest}
      style={{
        flex: 1,
        width: "100%",
        background: "var(--bg-sunken)",
        border: `1px solid ${invalid ? "var(--danger)" : "var(--border-strong)"}`,
        borderRadius: "var(--radius-md)",
        color: "var(--text-primary)",
        padding: iconLeft ? "8px 11px 8px 32px" : "8px 11px",
        fontSize: "var(--text-sm)",
        fontFamily: "inherit",
        outline: "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = invalid ? "var(--danger)" : "var(--accent-border)";
        e.currentTarget.style.boxShadow = "var(--ring-focus)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = invalid ? "var(--danger)" : "var(--border-strong)";
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  );

  if (!iconLeft) return field;

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
      <span
        style={{
          position: "absolute",
          left: 10,
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
