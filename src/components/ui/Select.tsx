"use client";

import type { SelectHTMLAttributes } from "react";

type Option = { value: string; label: string };

type SelectProps = {
  options: Option[];
} & SelectHTMLAttributes<HTMLSelectElement>;

/** Styled native select — keeps full a11y, matches Topbar's original control. */
export default function Select({ options, style, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      style={{
        background: "var(--bg-sunken)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-md)",
        color: "var(--text-primary)",
        padding: "7px 10px",
        fontSize: "var(--text-sm)",
        fontFamily: "inherit",
        cursor: "pointer",
        outline: "none",
        ...style,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
