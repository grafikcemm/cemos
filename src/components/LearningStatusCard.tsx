"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";

type CronRunInfo = {
  kind: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  partial: boolean;
  error: string | null;
} | null;

type LearningStatus = {
  success: boolean;
  lastDaily: CronRunInfo;
  lastLearn: CronRunInfo;
  patternsMinedLast7d: number;
  engagementEventsLast7d: number;
  topPatterns: { patternName: string; successScore: number; usageCount: number }[];
};

const cardStyle: React.CSSProperties = {
  background: "#0e0e0e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: 16,
  marginBottom: 14,
};

function formatRun(run: CronRunInfo): { text: string; color: string } {
  if (!run) return { text: "henüz çalışmadı", color: "var(--text-muted)" };
  const dt = new Date(run.startedAt).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!run.finishedAt) return { text: `${dt} — çalışıyor…`, color: "#f59e0b" };
  if (!run.ok) return { text: `${dt} — hata: ${run.error || "bilinmiyor"}`, color: "#f87171" };
  if (run.partial) return { text: `${dt} — kısmi tamamlandı`, color: "#f59e0b" };
  return { text: `${dt} — başarılı`, color: "#4ade80" };
}

/**
 * Makes the continuous-learning loop visible: last cron results, this week's
 * mined patterns + engagement verdicts, and the current top patterns.
 */
export default function LearningStatusCard() {
  const [status, setStatus] = useState<LearningStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchJson<LearningStatus>("/api/growth/learning-status")
      .then((data) => {
        if (mounted) setStatus(data);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Öğrenme durumu alınamadı");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div style={{ ...cardStyle, borderColor: "rgba(239,68,68,0.3)", color: "#f87171", fontSize: 12 }}>
        Öğrenme durumu yüklenemedi: {error}
      </div>
    );
  }

  const daily = formatRun(status?.lastDaily ?? null);
  const learn = formatRun(status?.lastLearn ?? null);

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        ÖĞRENME DURUMU — sistem her gün keşfeder, müzakere eder, kendi tweet performansından öğrenir
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Günlük cron (keşif + üretim)</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: daily.color, marginTop: 4 }}>
            {status ? daily.text : "yükleniyor…"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Öğrenme cronu (mining + engagement)</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: learn.color, marginTop: 4 }}>
            {status ? learn.text : "yükleniyor…"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Son 7 gün</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            <strong style={{ color: "var(--accent)" }}>{status ? status.patternsMinedLast7d : "–"}</strong>{" "}
            yeni pattern ·{" "}
            <strong style={{ color: "#60a5fa" }}>{status ? status.engagementEventsLast7d : "–"}</strong>{" "}
            engagement sinyali
          </div>
        </div>
      </div>

      {status && status.topPatterns.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
            En güçlü pattern'ler (gerçek performansla güncellenir)
          </div>
          {status.topPatterns.map((p) => (
            <div key={p.patternName} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span style={{ color: "var(--text-primary)" }}>{p.patternName}</span>
              <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                skor {p.successScore} · {p.usageCount} kullanım
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
