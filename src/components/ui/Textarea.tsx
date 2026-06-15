"use client";

import type { TextareaHTMLAttributes } from "react";

type TextareaProps = {
  invalid?: boolean;
  /** Show a `current / max` counter under the field. */
  charCount?: { current: number; max: number };
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export default function Textarea({ invalid = false, charCount, style, ...rest }: TextareaProps) {
  const over = charCount ? charCount.current > charCount.max : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <textarea
        {...rest}
        style={{
          width: "100%",
          minHeight: 80,
          resize: "vertical",
          background: "var(--bg-base)",
          border: `1px solid ${invalid || over ? "var(--danger)" : "var(--border-strong)"}`,
          borderRadius: "var(--radius-md)",
          color: "var(--text-primary)",
          padding: "8px 10px",
          fontSize: "var(--text-sm)",
          lineHeight: 1.5,
          fontFamily: "inherit",
          outline: "none",
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor =
            invalid || over ? "var(--danger)" : "var(--accent-border)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor =
            invalid || over ? "var(--danger)" : "var(--border-strong)";
        }}
      />
      {charCount && (
        <span
          style={{
            alignSelf: "flex-end",
            fontSize: "var(--text-2xs)",
            color: over ? "var(--danger)" : "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {charCount.current} / {charCount.max}
        </span>
      )}
    </div>
  );
}
