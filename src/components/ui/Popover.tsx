"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";

/**
 * Non-modal popover menü (Faz 1C.2 §8D/§8F). Hesap değiştirici + karar-kartı
 * taşma menüsü bunu paylaşır. Modal DEĞİL: dışarı-tık katmanı TAMAMEN transparent
 * (workspace görünür kalır), focus trap YOK. WAI-ARIA menü-butonu deseni:
 *  - Trigger tıkla/Enter/Space/ok → açılır, focus ilk (veya aktif) öğeye gider.
 *  - ArrowUp/Down/Home/End → roving focus; Escape → kapat + focus trigger'a döner.
 *  - Dışarı tık / Tab → kapatır. z-index katman > perde.
 *
 * Ref erişimi yalnız effect/handler'da (render'da DEĞİL) — trigger'a ref OBJESİ
 * yayılır, focus-return open→false effect'inde yapılır (react-hooks/refs uyumlu).
 */

type Align = "stretch" | "start" | "end";
type Side = "top" | "bottom";

export type PopoverTriggerProps = {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
};

type PopoverProps = {
  /** Menü aria-label'ı (erişilebilir ad). */
  label: string;
  /** Trigger butonu — verilen props'u kendi <button>'una yayar. */
  trigger: (props: PopoverTriggerProps, state: { open: boolean }) => ReactNode;
  /** Menü içeriği — close() ile kapatılır. role="menuitem" butonlar beklenir. */
  children: (close: () => void) => ReactNode;
  side?: Side;
  align?: Align;
  menuTestId?: string;
  menuWidth?: number | string;
  /** Trigger sarmalayıcısı tam genişlik (sidebar kartı) mı. */
  fill?: boolean;
};

export default function Popover({
  label,
  trigger,
  children,
  side = "bottom",
  align = "stretch",
  menuTestId,
  menuWidth,
  fill,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  // Refocus flag STATE (ref değil) — close() render'da ref'e dokunmasın diye.
  const [pendingRefocus, setPendingRefocus] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback((refocus = true) => {
    setPendingRefocus(refocus);
    setOpen(false);
  }, []);

  // Kapanışta (open→false) focus'u tetikleyiciye geri al — ref erişimi effect'te.
  useEffect(() => {
    if (open || !pendingRefocus) return;
    setPendingRefocus(false);
    triggerRef.current?.focus();
  }, [open, pendingRefocus]);

  // Açılışta focus'u aktif (aria-current) öğeye, yoksa ilk öğeye taşı.
  useEffect(() => {
    if (!open) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (!items.length) return;
    const current = items.find((el) => {
      const cur = el.getAttribute("aria-current");
      return cur && cur !== "false";
    });
    (current ?? items[0]).focus();
  }, [open]);

  const moveFocus = (dir: 1 | -1) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (!items.length) return;
    const idx = items.findIndex((el) => el === document.activeElement);
    const next = idx === -1 ? (dir === 1 ? 0 : items.length - 1) : (idx + dir + items.length) % items.length;
    items[next]?.focus();
  };

  const focusEdge = (edge: "first" | "last") => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (!items.length) return;
    (edge === "first" ? items[0] : items[items.length - 1]).focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "Home":
        e.preventDefault();
        focusEdge("first");
        break;
      case "End":
        e.preventDefault();
        focusEdge("last");
        break;
      case "Tab":
        // Odak menüden çıkıyor → kapat (doğal tab akışı, focus'u geri alma).
        close(false);
        break;
      default:
        break;
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
    } else if (open && e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const menuStyle: CSSProperties = {
    position: "absolute",
    zIndex: 100,
    ...(side === "bottom" ? { top: "calc(100% + 4px)" } : { bottom: "calc(100% + 6px)" }),
    ...(align === "stretch" ? { left: 0, right: 0 } : align === "start" ? { left: 0 } : { right: 0 }),
    ...(menuWidth != null ? { width: menuWidth } : null),
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    // Popover gölgesi — MODAL gölgesi DEĞİL (workspace kararmaz).
    boxShadow: "var(--shadow-lg)",
    padding: 5,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 180,
  };

  const triggerProps: PopoverTriggerProps = {
    ref: triggerRef,
    onClick: () => setOpen((v) => !v),
    onKeyDown: onTriggerKeyDown,
    "aria-haspopup": "menu",
    "aria-expanded": open,
  };

  return (
    <div style={{ position: "relative", ...(fill ? {} : { display: "inline-block" }) }}>
      {trigger(triggerProps, { open })}
      {open && (
        <>
          {/* Dışarı-tık katmanı — TAMAMEN transparent, modal perdesi DEĞİL. */}
          <div
            aria-hidden
            onClick={() => close(false)}
            style={{ position: "fixed", inset: 0, zIndex: 90, background: "transparent" }}
          />
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            data-testid={menuTestId}
            style={menuStyle}
            onKeyDown={onMenuKeyDown}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}
