"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";

type ReadinessStatus = {
  ready: boolean;
  readyWithWarning?: boolean;
  modelProfile?: string;
  checks: {
    workerRecent: boolean;
    openrouterOk: boolean;
    socialdataOk: boolean;
    databaseOk: boolean;
    accountsFound: boolean;
    automationEnabled: boolean;
    cadenceDaily: boolean;
    dailyMaxPostsOne: boolean;
    todayItemsPerfect: boolean;
    costUnderBudget: boolean;
  };
  issues: string[];
  warnings: string[];
  stats: Record<string, {
    found: boolean;
    automationEnabled: boolean;
    cadence: string;
    dailyMaxPosts: number;
    todayItems: number;
    lastScanAt: string | null;
  }>;
  backlog: Record<string, number>;
  todayItemsCount: number;
  monthlyBudgetExceeded: boolean;
  totalMonthCost: number;
  lastScanResult?: {
    success: boolean;
    timestamp: string;
    results: Array<{
      account: string;
      status: string;
      sourcesScanned?: number;
      tweetsFound?: number;
      postsInserted?: number;
      duplicatesFound?: number;
      candidateSourcePostsFound?: number;
      draftAttempts?: number;
      draftsCreated: number;
      draftsBlocked: number;
      reason: string;
      error?: string;
    }>;
  };
  workerInferredStatus?: string;
  workerMode?: "worker" | "cron";
};

export default function OperatorReadinessGate() {
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchReadiness = () => {
    fetchJson<ReadinessStatus>("/api/settings/operator-readiness")
      .then((data) => setReadiness(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

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
      // fetchJson surfaces the status + API error (or a body preview) instead
      // of the old generic "İletişim hatası" / raw JSON-parse crash.
      alert("Hata oluştu: " + (err instanceof Error ? err.message : "İletişim hatası"));
    } finally {
      setGenerating(false);
      fetchReadiness();
    }
  };

  useEffect(() => {
    fetchReadiness();
    
    // Refresh readiness state every 15s to keep it accurate
    const interval = setInterval(fetchReadiness, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "16px",
        marginBottom: 16,
        fontSize: 12,
        color: "var(--text-muted)",
        textAlign: "center"
      }}>
        🌀 Sistem hazırlık durumu kontrol ediliyor...
      </div>
    );
  }

  if (!readiness) return null;

  const isWarning = readiness.ready && readiness.readyWithWarning;

  if (readiness.ready) {
    return (
      <div style={{
        background: isWarning ? "rgba(245, 158, 11, 0.06)" : "rgba(155,44,52, 0.08)",
        border: isWarning ? "1px solid rgba(245, 158, 11, 0.25)" : "1px solid rgba(155,44,52, 0.35)",
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 16,
        fontSize: 13,
        color: "var(--text-primary)"
      }}>
        <div style={{ color: isWarning ? "#f59e0b" : "var(--accent)", fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{isWarning ? "⚠️ Taslaklar Hazır (Worker Uyarısı)" : "🚀 Operator Mode Hazır"}</span>
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 12 }}>
          grafikcem ve maskulenkod için bugünün taslakları hazır (toplam <strong>{readiness.todayItemsCount}</strong>).{" "}
          <strong>Manuel operasyon yapılabilir</strong> — incele, düzenle, kopyala, paylaş.
          {isWarning && readiness.warnings.length > 0 && (
            <ul style={{ margin: "8px 0 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
              {readiness.warnings.map((w, i) => (
                <li key={i} style={{ color: "#fbbf24" }}>
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>

        {readiness.lastScanResult?.results && (
          <div style={{
            padding: "10px 12px",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.04)",
            borderRadius: 6,
            fontSize: 11
          }}>
            <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
              <span>📊 Son Otomasyon Taraması ({new Date(readiness.lastScanResult.timestamp).toLocaleTimeString("tr-TR")}):</span>
              <span>Profil: {readiness.modelProfile === "premium" ? "Premium" : readiness.modelProfile === "operator_quality" ? "Operator Quality" : "Dev (Free)"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {readiness.lastScanResult.results.map((r: any, idx: number) => {
                let reasonText = "";
                if (r.draftsCreated > 0) {
                  const modeText = r.reason === "existing_source_posts_used" ? "DB backlog post kullanıldı" : "taramayla üretildi";
                  reasonText = `✅ ${r.draftsCreated} taslak (${modeText})`;
                } else {
                  let mappedReason = r.reason || "limit doldu";
                  if (mappedReason === "duplicate") mappedReason = "kopya (duplicate)";
                  else if (mappedReason === "quality blocked" || mappedReason === "all_candidates_quality_blocked") mappedReason = "kalite blocker";
                  else if (mappedReason === "API error" || mappedReason === "model_error") mappedReason = "model/API hatası";
                  else if (mappedReason === "no_tweets_found") mappedReason = "kaynak bulunamadı";
                  else if (mappedReason === "socialdata_budget_reached") mappedReason = "bütçe limiti";
                  else if (mappedReason === "daily_limit_reached") mappedReason = "günlük limit doldu";
                  else if (mappedReason === "no_enabled_sources") mappedReason = "kaynaklar kapalı";
                  
                  reasonText = `❌ skipped, neden: ${mappedReason}`;
                }
                return (
                  <div key={idx} style={{ color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                    <span>@{r.account} (Scan: {r.tweetsFound ?? 0} tweet / Aday: {r.candidateSourcePostsFound ?? 0})</span>
                    <span style={{ fontWeight: 500, color: r.draftsCreated > 0 ? "var(--accent)" : "#f87171" }}>
                      {reasonText}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Not ready state
  // Determine dynamic solution message
  let solutionText = "";
  if (!readiness.checks.openrouterOk || !readiness.checks.socialdataOk) {
    solutionText = "Ayarlar/env kontrol et";
  } else if (!readiness.checks.costUnderBudget) {
    solutionText = "Bütçe artır veya üretimi beklet";
  } else if (!readiness.checks.automationEnabled) {
    solutionText = "Ayarlar’dan Operator Mode’u Başlat";
  } else if (!readiness.checks.workerRecent) {
    solutionText = "npm run dev:operator veya worker process’i çalıştır";
  } else if (!readiness.checks.todayItemsPerfect) {
    solutionText = "Bugünkü Taslakları Üret";
  } else {
    solutionText = "Eksikleri giderin veya sayfayı yenileyin";
  }

  // Show "Bugünkü Taslakları Üret" button if today items missing
  const canShowProduceButton = 
    readiness.checks.openrouterOk &&
    readiness.checks.socialdataOk &&
    readiness.checks.databaseOk &&
    readiness.checks.accountsFound &&
    readiness.checks.costUnderBudget &&
    readiness.checks.automationEnabled &&
    !readiness.checks.todayItemsPerfect;

  return (
    <div style={{
      background: "rgba(239, 68, 68, 0.06)",
      border: "1px solid rgba(239, 68, 68, 0.25)",
      borderRadius: 8,
      padding: "14px 16px",
      marginBottom: 16,
      fontSize: 13,
      color: "var(--text-primary)"
    }}>
      <div style={{ color: "#ef4444", fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <span>⚠️ Operator Mode Hazır Değil</span>
      </div>
      
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
        Gözlemlenen eksikler ve düzeltilmesi gerekenler:
      </div>

      <ul style={{ margin: "0 0 12px 0", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        {readiness.issues.map((iss, i) => (
          <li key={i} style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "#f87171", marginRight: 4 }}>•</span> {iss}
          </li>
        ))}
        {readiness.warnings.map((warn, i) => (
          <li key={`warn-${i}`} style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "#fbbf24", marginRight: 4 }}>•</span> {warn} (Warning)
          </li>
        ))}
      </ul>

      {readiness.lastScanResult?.results && (
        <div style={{
          marginBottom: 12,
          padding: "10px 12px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: 6,
          fontSize: 11
        }}>
          <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
            <span>📊 Son Otomasyon Taraması ({new Date(readiness.lastScanResult.timestamp).toLocaleTimeString("tr-TR")}):</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {readiness.lastScanResult.results.map((r: any, idx: number) => {
              let reasonText = "";
              if (r.draftsCreated > 0) {
                const modeText = r.reason === "existing_source_posts_used" ? "DB backlog post kullanıldı" : "taramayla üretildi";
                reasonText = `✅ ${r.draftsCreated} taslak (${modeText})`;
              } else {
                let mappedReason = r.reason || "limit doldu";
                if (mappedReason === "duplicate") mappedReason = "kopya (duplicate)";
                else if (mappedReason === "quality blocked" || mappedReason === "all_candidates_quality_blocked") mappedReason = "kalite blocker";
                else if (mappedReason === "API error" || mappedReason === "model_error") mappedReason = "model/API hatası";
                else if (mappedReason === "no_tweets_found") mappedReason = "kaynak bulunamadı";
                else if (mappedReason === "socialdata_budget_reached") mappedReason = "bütçe limiti";
                else if (mappedReason === "daily_limit_reached") mappedReason = "günlük limit doldu";
                else if (mappedReason === "no_enabled_sources") mappedReason = "kaynaklar kapalı";
                
                reasonText = `❌ skipped, neden: ${mappedReason}`;
              }
              return (
                <div key={idx} style={{ color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                  <span>@{r.account} (Scan: {r.tweetsFound ?? 0} tweet / Aday: {r.candidateSourcePostsFound ?? 0})</span>
                  <span style={{ fontWeight: 500, color: r.draftsCreated > 0 ? "var(--accent)" : "#f87171" }}>
                    {reasonText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canShowProduceButton && (
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-start" }}>
          <button
            onClick={handleGenerateToday}
            disabled={generating}
            style={{
              padding: "6px 12px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--bg-base)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
          >
            {generating ? "⏳ Taslaklar Üretiliyor..." : "⚡ Bugünkü Taslakları Üret"}
          </button>
        </div>
      )}

      <div style={{ fontSize: 11, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10, color: "var(--text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div>
          💡 <strong>Çözüm:</strong> {solutionText}
        </div>
        <button 
          onClick={() => {
            setLoading(true);
            fetchReadiness();
          }}
          style={{
            padding: "2px 8px",
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 10,
            color: "var(--text-secondary)",
            cursor: "pointer"
          }}
        >
          🔄 Yenile
        </button>
      </div>
    </div>
  );
}
