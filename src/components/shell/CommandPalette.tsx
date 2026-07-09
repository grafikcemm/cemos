"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { allNavigableTabs, normalizeTabId } from "@/components/nav/navConfig";
import { normalizeTurkish } from "@/lib/utils/textSimilarity";

/**
 * Cmd/Ctrl-K komut paleti (FINAL-UX-SPEC V1 — Sprint 9).
 * Ekranlar arası klavye-öncelikli atlama: filtre + ↑↓ + Enter. Token'lı,
 * portal'sız basit overlay (shell'in en üstünde render edilir). Reduced-motion
 * globals.css global kuralıyla kapsanır.
 */

type PaletteProps = {
  onNavigate: (tabId: string) => void;
  activeTab: string;
};

export default function CommandPalette({ onNavigate, activeTab }: PaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const tabs = useMemo(() => allNavigableTabs(), []);
  const current = normalizeTabId(activeTab);

  const results = useMemo(() => {
    const q = normalizeTurkish(query.trim());
    const pool = tabs.filter((t) => t.id !== current);
    if (!q) return pool;
    return pool.filter(
      (t) => normalizeTurkish(t.label).includes(q) || normalizeTurkish(t.group).includes(q) || t.id.includes(q)
    );
  }, [query, tabs, current]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, []);

  // Global Cmd/Ctrl-K — input/textarea odaklıyken de çalışır (palete geçiş kasıtlı).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  const go = (id: string) => {
    onNavigate(id);
    close();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Komut paleti"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "18vh",
      }}
    >
      <div
        className="rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, calc(100vw - 32px))",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-2xl)",
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-faint)",
          }}
        >
          <Search size={16} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && results[cursor]) {
                e.preventDefault();
                go(results[cursor].id);
              }
            }}
            placeholder="Ekrana atla… (örn. kuyruk, sistem, reels)"
            aria-label="Ekran ara"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "var(--text-primary)",
              fontSize: "var(--text-base)",
              fontFamily: "inherit",
            }}
          />
          <kbd
            style={{
              fontSize: "var(--text-2xs)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "2px 6px",
              fontFamily: "var(--font-mono)",
            }}
          >
            esc
          </kbd>
        </div>

        <div role="listbox" aria-label="Ekranlar" style={{ maxHeight: "46vh", overflowY: "auto", padding: 8 }}>
          {results.length === 0 ? (
            <div style={{ padding: "18px 14px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              Eşleşen ekran yok.
            </div>
          ) : (
            results.map((t, i) => (
              <button
                key={t.id}
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(t.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: i === cursor ? "var(--accent-tint-12)" : "transparent",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{t.label}</span>
                <span
                  style={{
                    fontSize: "var(--text-2xs)",
                    color: i === cursor ? "var(--accent-text)" : "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {t.group}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
