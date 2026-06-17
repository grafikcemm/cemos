"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Snapshot = {
  date: string;
  followerCount: number;
  reach: number;
  views: number;
  accountsEngaged: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  topMediaJson: string;
  seriesJson: string;
};

type SeriesPerf = {
  label: string;
  postCount: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalShares: number;
  avgEngagement: number;
};

type TopMedia = {
  mediaId: string;
  caption: string;
  permalink: string;
  reach: number;
  saves: number;
  shares: number;
};

const card: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 20,
};
const accentBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--accent-fg)",
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const tooltipStyle = {
  contentStyle: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, fontSize: 11 },
  labelStyle: { color: "#888" },
};

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ ...card, padding: 14, flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>
        {value.toLocaleString("tr-TR")}
      </div>
    </div>
  );
}

export default function InsightsPanel() {
  const [configured, setConfigured] = useState(true);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/instagram/insights");
      const json = await res.json();
      setConfigured(json.configured ?? false);
      setSnapshots(json.snapshots ?? []);
      setLatest(json.latest ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const capture = async () => {
    setCapturing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/instagram/insights", { method: "POST" });
      const json = await res.json();
      if (json.success && json.captured) {
        setNotice("Snapshot alındı.");
        await load();
      } else if (json.reason === "already_today") {
        setNotice("Bugünün snapshot'ı zaten alınmış.");
      } else {
        setNotice(json.error ? `Alınamadı: ${json.error}` : "Veri gelmedi (Meta bağlantısını kontrol edin).");
      }
    } finally {
      setCapturing(false);
    }
  };

  const series: SeriesPerf[] = latest ? safeParse<SeriesPerf[]>(latest.seriesJson, []) : [];
  const topMedia: TopMedia[] = latest ? safeParse<TopMedia[]>(latest.topMediaJson, []) : [];
  const weekly = snapshots.slice(-7);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>İstatistikler</h3>
        <button style={accentBtn} disabled={capturing} onClick={capture}>
          {capturing ? "Alınıyor…" : "Anlık Görüntü Al"}
        </button>
      </div>

      {notice && (
        <div style={{ ...card, padding: 12, marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" }}>
          {notice}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Yükleniyor…</p>
      ) : !configured ? (
        <div style={{ ...card }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Meta erişimi ayarlı değil. Kurulum: <code>docs/META_KURULUM.md</code>. Yapılandırılana kadar
            istatistik boş kalır.
          </p>
        </div>
      ) : snapshots.length === 0 ? (
        <div style={{ ...card }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
            Henüz snapshot yok. &quot;Anlık Görüntü Al&quot; ile bugünün verisini çekin (günde 1 kez).
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Metrik kartları */}
          {latest && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <MetricCard label="Takipçi" value={latest.followerCount} />
              <MetricCard label="Erişim (reach)" value={latest.reach} />
              <MetricCard label="Etkileşen hesap" value={latest.accountsEngaged} />
              <MetricCard label="Görüntülenme" value={latest.views} />
            </div>
          )}

          {/* Grafik 1: takipçi + reach çizgi */}
          <div style={{ ...card }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Takipçi &amp; Erişim</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={snapshots} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#444" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#444" }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="followerCount" name="Takipçi" stroke="#e11d48" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="reach" name="Erişim" stroke="#5cc8ff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Grafik 2: haftalık saves/shares bar */}
          <div style={{ ...card }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Haftalık Kaydetme &amp; Paylaşım</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#444" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#444" }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="saves" name="Kaydetme" fill="#e11d48" radius={[3, 3, 0, 0]} />
                <Bar dataKey="shares" name="Paylaşım" fill="#5cc8ff" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Seri performansı */}
          <div style={{ ...card }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              Seri Performansı (engagement sıralı)
            </div>
            {series.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>Seri verisi yok.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "var(--text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Seri</th>
                    <th style={{ padding: "6px 8px" }}>Post</th>
                    <th style={{ padding: "6px 8px" }}>Erişim</th>
                    <th style={{ padding: "6px 8px" }}>Kaydet</th>
                    <th style={{ padding: "6px 8px" }}>Paylaşım</th>
                    <th style={{ padding: "6px 8px" }}>Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => (
                    <tr key={s.label} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{s.label}</td>
                      <td style={{ padding: "6px 8px" }}>{s.postCount}</td>
                      <td style={{ padding: "6px 8px" }}>{s.totalReach.toLocaleString("tr-TR")}</td>
                      <td style={{ padding: "6px 8px" }}>{s.totalSaves.toLocaleString("tr-TR")}</td>
                      <td style={{ padding: "6px 8px" }}>{s.totalShares.toLocaleString("tr-TR")}</td>
                      <td style={{ padding: "6px 8px", color: "var(--accent)", fontWeight: 700 }}>
                        {s.avgEngagement.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Top medya */}
          <div style={{ ...card }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>En İyi Medyalar (erişim)</div>
            {topMedia.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>Medya verisi yok.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "var(--text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Gönderi</th>
                    <th style={{ padding: "6px 8px" }}>Erişim</th>
                    <th style={{ padding: "6px 8px" }}>Kaydet</th>
                    <th style={{ padding: "6px 8px" }}>Paylaşım</th>
                  </tr>
                </thead>
                <tbody>
                  {topMedia.map((m) => (
                    <tr key={m.mediaId} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={m.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-primary)" }}>
                          {m.caption ? m.caption.slice(0, 60) : m.mediaId}
                        </a>
                      </td>
                      <td style={{ padding: "6px 8px" }}>{m.reach.toLocaleString("tr-TR")}</td>
                      <td style={{ padding: "6px 8px" }}>{m.saves.toLocaleString("tr-TR")}</td>
                      <td style={{ padding: "6px 8px" }}>{m.shares.toLocaleString("tr-TR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
