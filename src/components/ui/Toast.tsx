"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<ToastTone, { border: string; color: string }> = {
  success: { border: "rgba(52,211,153,0.4)", color: "var(--green)" },
  error: { border: "rgba(244,63,94,0.4)", color: "var(--danger)" },
  info: { border: "var(--border-strong)", color: "var(--text-primary)" },
};

let nextId = 1;

/** Single app-level toast provider — replaces the per-tab inline toast JSX. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // SSR + ilk client render uyumlu olsun diye portal yalnızca mount sonrası
  // render edilir — aksi halde createPortal hydration mismatch üretir.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            style={{
              position: "fixed",
              bottom: 20,
              right: 20,
              zIndex: 2000,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxWidth: 360,
            }}
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                style={{
                  background: "var(--bg-elevated)",
                  border: `1px solid ${TONE_STYLE[t.tone].border}`,
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-lg), var(--highlight-top)",
                  padding: "10px 14px",
                  fontSize: "var(--text-sm)",
                  color: TONE_STYLE[t.tone].color,
                  animation: "toast-in 0.2s ease",
                }}
              >
                {t.message}
              </div>
            ))}
            <style>{`@keyframes toast-in { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
