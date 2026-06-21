"use client";

import type { ReactNode } from "react";

type PageScaffoldProps = {
  /** Sayfa manşeti — <PageHeader/> (kendi alt boşluğunu taşır). */
  header: ReactNode;
  /** İsteğe bağlı iç sekme şeridi — birleşik host sayfalar (<SubNav/>). */
  subnav?: ReactNode;
  /** İsteğe bağlı araç çubuğu — <FilterBar/> vb. */
  toolbar?: ReactNode;
  /** İçerik bölgeleri — kart yığını (otomatik --stack gap). */
  children: ReactNode;
};

/**
 * Standart sayfa iskeleti — sola yaslı, ferah ritim. Her sekme bunu kullanır;
 * bespoke `margin:0 auto` / `maxWidth` ortalamasını ortadan kaldırır.
 * Sıra: header → subnav → toolbar → children.
 */
export default function PageScaffold({ header, subnav, toolbar, children }: PageScaffoldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", minWidth: 0 }}>
      {header}
      {subnav && <div style={{ marginBottom: "var(--space-6)" }}>{subnav}</div>}
      {toolbar && <div style={{ marginBottom: "var(--space-6)" }}>{toolbar}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)", minWidth: 0 }}>{children}</div>
    </div>
  );
}
