"use client";

import { Hammer } from "lucide-react";
import PageScaffold from "@/components/ui/PageScaffold";
import PageHeader from "@/components/ui/PageHeader";

type HostPlaceholderProps = {
  /** Üst eyebrow — alan adı (Plan / Kütüphane / Profil). */
  eyebrow: string;
  /** Ekran başlığı. */
  title: string;
  /** Kısa açıklama — bu yüzeyin amacı. */
  subtitle: string;
  /** Bu yüzeyde neyin yaşayacağı — dürüst, tek cümle. */
  comingContent: string;
  /**
   * Başlığı shell (AppShell WorkspaceHeader) sağlıyorsa true — placeholder yalnız
   * gövdeyi render eder (çift başlık olmaz). Referans sıra: shell hero başlık →
   * segmented subnav → bu gövde.
   */
  bare?: boolean;
};

/**
 * Faz 1B iskele yüzeyi (05 empty-state). Yeni ev id'si nav/store/shell'e bağlıdır
 * ama tam kompozisyon Faz 1D'de gelir. DÜRÜST placeholder: ölü CTA yok, sahte
 * işlev yok — yalnız ne geleceğini söyler. Eski dashboard kompozisyonu
 * KOPYALANMAZ (kullanıcı-erişilebilir legacy kompozisyon Faz 1 sonunda sıfır).
 */
export default function HostPlaceholder({ eyebrow, title, subtitle, comingContent, bare = false }: HostPlaceholderProps) {
  return (
    <PageScaffold header={bare ? null : <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />}>
      <div
        data-testid="host-placeholder"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 12,
          padding: "56px 24px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--radius-md)",
            background: "var(--accent-dark)",
            color: "var(--accent-text)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Hammer size={20} strokeWidth={2} />
        </span>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--text-primary)" }}>
          Bu yüzey hazırlanıyor
        </div>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", maxWidth: 440, lineHeight: 1.6 }}>
          {comingContent}
        </p>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          Yeni sisteme taşınma sürüyor.
        </span>
      </div>
    </PageScaffold>
  );
}
