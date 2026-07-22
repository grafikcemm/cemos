"use client";

import type { ReactNode } from "react";

type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
  /** Sayısal kolon: tabular-nums + sağa hizalama (align verilmezse). */
  numeric?: boolean;
};

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  compact?: boolean;
  onRowClick?: (row: T) => void;
};

/** Dense data table for analytics screens (rankings, sources, costs). */
export default function Table<T>({ columns, rows, getRowKey, compact, onRowClick }: TableProps<T>) {
  const cellPad = compact ? "6px 10px" : "9px 12px";

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? (c.numeric ? "right" : "left"),
                  padding: cellPad,
                  width: c.width,
                  fontSize: "var(--text-2xs)",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border-faint)",
                  background: "var(--bg-elevated)",
                  whiteSpace: "nowrap",
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default", transition: "background 0.12s" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={c.numeric ? "tnum" : undefined}
                  style={{
                    textAlign: c.align ?? (c.numeric ? "right" : "left"),
                    padding: cellPad,
                    color: "var(--text-primary)",
                    borderBottom: "1px solid var(--border-faint)",
                    verticalAlign: "middle",
                  }}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
