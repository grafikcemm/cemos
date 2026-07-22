"use client";

import { Search } from "lucide-react";

type SearchInputProps = {
  /** Placeholder metni (buton modunda görünen etiket). */
  placeholder?: string;
  /** Klavye kısayolu ipucu (örn. "⌘K"). */
  kbdHint?: string;
  onClick?: () => void;
  /** Genişlik (varsayılan 220). */
  width?: number | string;
  className?: string;
};

/**
 * Arama görünümlü tetikleyici — gerçek input değil, tıklanınca komut paletini
 * (veya verilen handler'ı) açan buton. Dashboard topbar arama kalıbı.
 */
export default function SearchInput({
  placeholder = "Ara…",
  kbdHint = "⌘K",
  onClick,
  width = 220,
  className,
}: SearchInputProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={placeholder}
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width,
        height: "var(--control-h-sm)",
        padding: "0 10px",
        background: "var(--bg-sunken)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        color: "var(--text-muted)",
        fontSize: "var(--text-xs)",
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
        transition: "border-color 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      <Search size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {placeholder}
      </span>
      {kbdHint && (
        <kbd
          style={{
            fontSize: "var(--text-2xs)",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "1px 5px",
            fontFamily: "var(--font-mono)",
          }}
        >
          {kbdHint}
        </kbd>
      )}
    </button>
  );
}
