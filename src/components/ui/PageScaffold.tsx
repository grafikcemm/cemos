"use client";

import type { ReactNode } from "react";

/** Desktop içerik genişliği varyantları (1B.5). Belirtilmezse shell'in
 *  ekran-bazlı genişliğini doldurur (varsayılan davranış korunur). */
type ScaffoldWidth = "reading" | "standard" | "wide";

const WIDTH_TOKEN: Record<ScaffoldWidth, string> = {
  reading: "var(--content-reading)",
  standard: "var(--content-standard)",
  wide: "var(--content-wide)",
};

type PageScaffoldProps = {
  /** Sayfa manşeti — <PageHeader/> (kendi alt boşluğunu taşır). */
  header: ReactNode;
  /** İsteğe bağlı iç sekme şeridi — birleşik host sayfalar (<SubNav/>). */
  subnav?: ReactNode;
  /** İsteğe bağlı araç çubuğu — <FilterBar/> vb. */
  toolbar?: ReactNode;
  /** Okuma genişliği — reading(960)/standard(1080)/wide(1280); yoksa doldurur. */
  width?: ScaffoldWidth;
  /** İçerik bölgeleri — kart yığını (otomatik --stack gap). */
  children: ReactNode;
};

/**
 * Standart sayfa iskeleti — sola yaslı, ferah ritim. Her sekme bunu kullanır;
 * bespoke `margin:0 auto` / `maxWidth` ortalamasını ortadan kaldırır.
 * Sıra: header → subnav → toolbar → children. `width` verilmişse kendi max
 * genişliğinde ortalanır (shell genişliğinin İÇİNDE).
 */
export default function PageScaffold({ header, subnav, toolbar, width, children }: PageScaffoldProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minWidth: 0,
        ...(width ? { maxWidth: WIDTH_TOKEN[width], marginInline: "auto" } : {}),
      }}
    >
      {header}
      {subnav && <div style={{ marginBottom: "var(--space-6)" }}>{subnav}</div>}
      {toolbar && <div style={{ marginBottom: "var(--space-6)" }}>{toolbar}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)", minWidth: 0 }}>{children}</div>
    </div>
  );
}
