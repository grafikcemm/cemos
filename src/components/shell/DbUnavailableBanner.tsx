"use client";

import { useSystemHealth } from "./SystemHealthProvider";
import { formatLastGoodAt } from "@/lib/services/systemHealth";

/**
 * WP-01 — TEK global altyapı bandı. DB-erişilemezlik DOĞRULANDIĞINDA (health 200
 * + database.ok:false) shell'in üstünde bir kez görünür; ekran başına hata
 * yağmurunun yerini alan tek dürüst açıklamadır. Ekranlar kendi boş/hata
 * durumlarını korur ama teşhis cümlesi buradadır. Mantık saf helpers'ta
 * (deriveDbAvailability/formatLastGoodAt — unit-testli); bu bileşen yalnız render.
 */
export default function DbUnavailableBanner() {
  const { dbUnavailable, lastGoodAt } = useSystemHealth();
  if (!dbUnavailable) return null;

  const stamp = formatLastGoodAt(lastGoodAt);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="db-unavailable-banner"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        fontSize: 13,
        lineHeight: 1.4,
        color: "var(--text-primary)",
        background: "color-mix(in oklab, var(--status-error) 12%, var(--bg-base))",
        borderBottom: "1px solid color-mix(in oklab, var(--status-error) 35%, transparent)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          background: "var(--status-error)",
        }}
      />
      <span>
        Veritabanına şu anda erişilemiyor — veriler geçici olarak yüklenemiyor.
        {stamp ? ` Son başarılı veri: ${stamp}.` : ""}
      </span>
    </div>
  );
}
