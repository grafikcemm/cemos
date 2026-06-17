"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  width?: number;
  children: ReactNode;
};

/**
 * Right-side slide-over for detail panels (queue/IG/YouTube/pipeline-trace).
 * Portal + ESC + click-outside + focus trap. Slide is opacity-only under reduced motion (globals.css).
 */
export default function Drawer({ open, onClose, title, width = 520, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") trapFocus(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const toFocus = panelRef.current?.querySelector<HTMLElement>(
      "button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])",
    );
    toFocus?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 1000 }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          animation: "drawer-fade 0.18s ease",
        }}
      />
      <div
        ref={panelRef}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: `min(${width}px, 100vw)`,
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-modal)",
          display: "flex",
          flexDirection: "column",
          animation: "drawer-slide 0.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {title != null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "16px 20px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <div
              className="font-display"
              style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
            >
              {title}
            </div>
            <button
              onClick={onClose}
              aria-label="Kapat"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
                e.currentTarget.style.borderColor = "var(--border-strong)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>{children}</div>
      </div>
      <style>{DRAWER_KEYFRAMES}</style>
    </div>,
    document.body,
  );
}

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const focusable = container.querySelectorAll<HTMLElement>(
    "button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])",
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const DRAWER_KEYFRAMES = `
@keyframes drawer-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes drawer-slide { from { transform: translateX(24px); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }`;
