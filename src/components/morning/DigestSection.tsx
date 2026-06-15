"use client";

import { useState, useEffect } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";

type Digest = {
  date: string;
  newsSummary: string;
  repoSummary: string;
  aiTips: string;
};

type DigestResponse = {
  success: boolean;
  digest: Digest | null;
};

export default function DigestSection() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchJson<DigestResponse>("/api/daily-digest")
      .then((data) => {
        if (mounted) setDigest(data.digest);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const blocks = [
    { label: "📰 AI Haber Özeti", value: digest?.newsSummary },
    { label: "📦 Repo Özeti", value: digest?.repoSummary },
    { label: "💡 AI İpuçları", value: digest?.aiTips },
  ].filter((b) => b.value && b.value.trim());

  return (
    <section style={{ marginBottom: 24 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 16px",
          cursor: "pointer",
          color: "var(--text-primary)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700 }}>Günlük Özet (Digest)</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{open ? "▲ Gizle" : "▼ Göster"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {loading ? (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
              ⏳ Digest yükleniyor...
            </div>
          ) : blocks.length === 0 ? (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, fontSize: 12, color: "var(--text-muted)" }}>
              Bugüne ait digest henüz oluşturulmadı. Haberler işlendikten sonra (06:00 cron ya da
              Haber Havuzu&apos;ndan &quot;Tümünü İşle&quot;) burada görünecek.
            </div>
          ) : (
            blocks.map((b) => (
              <div key={b.label} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 6 }}>
                  {b.label}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                  {b.value}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
