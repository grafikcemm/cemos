"use client";

import { useState, type ReactNode } from "react";

type TooltipProps = {
  content: ReactNode;
  side?: "top" | "bottom";
  children: ReactNode;
};

/** Lightweight hover/focus tooltip. No portal — relies on parent stacking. */
export default function Tooltip({ content, side = "top", children }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            [side]: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "var(--text-xs)",
            padding: "4px 8px",
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow-md)",
            zIndex: 200,
            pointerEvents: "none",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
