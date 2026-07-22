"use client";

import type { ReactNode } from "react";
import { Search, RotateCcw } from "lucide-react";
import Card from "./Card";
import Input from "./Input";
import Select from "./Select";

type FilterOption = { value: string; label: string };

type FilterField =
  | { kind: "select"; key: string; label: string; options: FilterOption[]; width?: number }
  | { kind: "segment"; key: string; label: string; options: FilterOption[] }
  | { kind: "search"; key: string; label?: string; placeholder?: string };

type FilterBarProps = {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onReset: () => void;
  resetLabel?: string;
  /** Sayfa aksiyonu (ör. "Tarama Başlat") — sağ uçta. */
  rightSlot?: ReactNode;
};

/**
 * Yapılandırma-tabanlı filtre çubuğu — eskiden her tab'da ~200 satırlık inline blok.
 * segment = belirgin hesap-sekme kümesi; select/search = wrap-flex satırı.
 */
export default function FilterBar({
  fields,
  values,
  onChange,
  onReset,
  resetLabel = "Sıfırla",
  rightSlot,
}: FilterBarProps) {
  const segments = fields.filter((f) => f.kind === "segment");
  const rest = fields.filter((f) => f.kind !== "segment");

  return (
    <Card variant="quiet">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {segments.map((f) =>
          f.kind === "segment" ? (
            <div key={f.key} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {f.options.map((o) => {
                const active = values[f.key] === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => onChange(f.key, o.value)}
                    aria-pressed={active}
                    style={{
                      padding: "7px 14px",
                      borderRadius: "var(--radius-md)",
                      border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
                      background: active ? "var(--accent-dark)" : "transparent",
                      color: active ? "var(--accent-text)" : "var(--text-secondary)",
                      fontSize: "var(--text-sm)",
                      fontWeight: active ? 500 : 500,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s, border-color 0.15s",
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          ) : null,
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          {rest.map((f) => {
            if (f.kind === "search") {
              return (
                <div key={f.key} style={{ flex: "1 1 220px", minWidth: 180 }}>
                  <Input
                    value={values[f.key] ?? ""}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    placeholder={f.placeholder ?? "Ara…"}
                    iconLeft={<Search size={15} />}
                  />
                </div>
              );
            }
            return (
              <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>
                  {f.label}
                </span>
                <Select
                  options={f.options}
                  value={values[f.key] ?? ""}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  style={{ width: f.width }}
                />
              </label>
            );
          })}

          <button
            onClick={onReset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid transparent",
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: "var(--text-sm)",
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <RotateCcw size={14} />
            {resetLabel}
          </button>

          {rightSlot && <div style={{ marginLeft: "auto" }}>{rightSlot}</div>}
        </div>
      </div>
    </Card>
  );
}
