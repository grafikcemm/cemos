"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { useSystemHealth } from "@/components/shell/SystemHealthProvider";

/**
 * Operator eylem kapısı (ADR-034 §F): canonical health contract'larından
 * (`SystemHealthProvider` → /api/health → operatorAction + todayReadiness)
 * beslenir. Eski davranış — /api/settings/operator-readiness'a 15 sn'de bir
 * bağımsız polling + duplicate DB sorguları — KALDIRILDI; artık tek fetch,
 * tek gerçeklik (Sistem sekmesi ve topbar ile çelişemez).
 *
 * Sessizlik sözleşmesi korunur: sağlıklıyken null döner; yalnız sorun/eylem
 * varken genişler. "Kuyruk tamamlandı" bir SORUN DEĞİLDİR (gate sessiz kalır).
 */
export default function OperatorReadinessGate() {
  const { contracts, refresh } = useSystemHealth();
  const [generating, setGenerating] = useState(false);

  const handleGenerateToday = async () => {
    const confirmed = confirm(
      "Bu işlem SocialData/OpenRouter çağrısı yapabilir. Günlük limit 1 taslak/hesap olarak korunacak."
    );
    if (!confirmed) return;

    setGenerating(true);
    try {
      const data = await fetchJson<{ success: boolean; error?: string }>(
        "/api/settings/operator-scan-now",
        { method: "POST" }
      );
      if (data.success) {
        alert("Taslak üretimi başarıyla tamamlandı!");
      } else {
        alert("Hata oluştu: " + (data.error || "Bilinmeyen bir hata"));
      }
    } catch (err) {
      alert("Hata oluştu: " + (err instanceof Error ? err.message : "İletişim hatası"));
    } finally {
      setGenerating(false);
      refresh();
    }
  };

  const action = contracts?.operatorAction;
  if (!action) return null; // provider yüklenmedi/başarısız — gate sessiz (fail-soft)

  const showWarn = action.level === "warn" || action.todayNeedsGeneration;
  if (action.level === "ok" && !action.todayNeedsGeneration) return null;

  if (action.level !== "blocked" && showWarn) {
    // Uyarı/eylem: tek satır kompakt; detay isteğe bağlı (genişleme = sorun).
    return (
      <details
        data-testid="operator-gate-warn"
        style={{
          background: "color-mix(in srgb, var(--yellow) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--yellow) 25%, transparent)",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: 12,
          color: "var(--text-primary)",
        }}
      >
        <summary style={{ cursor: "pointer", color: "var(--status-warn)", fontWeight: 500, listStyle: "none" }}>
          {action.todayNeedsGeneration
            ? "⚠️ Bugün taslak yok — üretimi başlatabilirsin (detay için tıkla)"
            : "⚠️ Üretim akışı uyarılı — taslak akışı çalışıyor, detay için tıkla"}
        </summary>
        {action.warnings.length > 0 && (
          <ul style={{ margin: "8px 0 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
            {action.warnings.map((w, i) => (
              <li key={i} style={{ color: "var(--status-warn)" }}>
                {w}
              </li>
            ))}
          </ul>
        )}
        {contracts?.todayReadiness?.message && (
          <div style={{ marginTop: 8, color: "var(--text-secondary)" }}>{contracts.todayReadiness.message}</div>
        )}
        {action.todayNeedsGeneration && action.canGenerate && (
          <div style={{ marginTop: 10 }}>
            <button
              onClick={handleGenerateToday}
              disabled={generating}
              data-testid="operator-gate-generate"
              style={{
                padding: "6px 12px",
                background: "var(--accent)",
                border: "none",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--bg-base)",
                cursor: "pointer",
              }}
            >
              {generating ? "⏳ Taslaklar Üretiliyor..." : "⚡ Bugünkü Taslakları Üret"}
            </button>
          </div>
        )}
      </details>
    );
  }

  // blocked: altyapı kırık — kırmızı kutu, blocker listesi canonical contract'tan.
  return (
    <div
      data-testid="operator-gate-blocked"
      style={{
        background: "color-mix(in srgb, var(--danger) 6%, transparent)",
        border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)",
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 16,
        fontSize: 13,
        color: "var(--text-primary)",
      }}
    >
      <div style={{ color: "var(--danger)", fontWeight: 500, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <span>⚠️ Üretim altyapısı hazır değil</span>
      </div>
      <ul style={{ margin: "0 0 12px 0", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        {action.blockers.map((b, i) => (
          <li key={i} style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "var(--status-error)", marginRight: 4 }}>•</span> {b}
          </li>
        ))}
        {action.warnings.map((w, i) => (
          <li key={`warn-${i}`} style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "var(--status-warn)", marginRight: 4 }}>•</span> {w} (uyarı)
          </li>
        ))}
      </ul>
      <div
        style={{
          fontSize: 11,
          borderTop: "1px solid var(--border-faint)",
          paddingTop: 10,
          color: "var(--text-muted)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <div>
          💡 <strong>Çözüm:</strong> Profil → Sistem'den altyapı detayına bak; env/credential eksiklerini gider.
        </div>
        <button
          onClick={refresh}
          style={{
            padding: "2px 8px",
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 10,
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          🔄 Yenile
        </button>
      </div>
    </div>
  );
}
