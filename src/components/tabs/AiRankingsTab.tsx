"use client";

import { useState, useEffect } from "react";
import { Trophy, Medal, Award, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { PageHeader, Card, EmptyState, Skeleton, Badge } from "@/components/ui";

type RankingRow = {
  rank?: number | null;
  model?: string;
  modelName?: string;
  model_name?: string;
  provider?: string | null;
  score?: number | null;
  bestFor?: string;
  bestUseCase?: string;
  best_use_case?: string;
  useCase?: string;
  category?: string;
};

type Response = {
  success: boolean;
  snapshotDate: string | null;
  source: string | null;
  rankings?: RankingRow[];
  error?: string;
};

const name = (r: RankingRow) => r.model || r.modelName || r.model_name || "—";
// Not "useCase": a use-prefixed name in a JSX callback trips react-hooks/rules-of-hooks.
const resolveUseCase = (r: RankingRow) => r.bestFor || r.bestUseCase || r.best_use_case || r.useCase || r.category || "—";

const rankColor = (rank: number | null | undefined) => {
  if (rank === 1) return "var(--yellow)";
  if (rank === 2) return "var(--text-secondary)";
  if (rank === 3) return "var(--accent-2-text)";
  return "var(--text-muted)";
};

const RankMedal = ({ rank }: { rank: number | null | undefined }) => {
  if (rank === 1) return <Trophy size={15} strokeWidth={2} style={{ color: "var(--yellow)" }} />;
  if (rank === 2) return <Medal size={15} strokeWidth={2} style={{ color: "var(--text-secondary)" }} />;
  if (rank === 3) return <Award size={15} strokeWidth={2} style={{ color: "var(--accent-2-text)" }} />;
  return null;
};

export default function AiRankingsTab() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [meta, setMeta] = useState<{ date: string | null; source: string | null }>({ date: null, source: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchJson<Response>("/api/ai-rankings")
      .then((data) => {
        if (!mounted) return;
        if (data.success) {
          setRows(data.rankings ?? []);
          setMeta({ date: data.snapshotDate, source: data.source });
        } else {
          setError(data.error || "Sıralama alınamadı.");
        }
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Sunucu hatası.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const sorted = [...rows].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      <PageHeader
        eyebrow="DEĞERLENDIR"
        title="AI Sıralama"
        subtitle="Model performans sıralamaları — hangi modelin hangi iş için en iyi olduğu."
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Sparkles size={14} strokeWidth={2} style={{ color: "var(--accent-text)" }} />
              <span>{meta.date ? <>Snapshot <strong className="tnum" style={{ color: "var(--text-primary)", fontWeight: 700 }}>{meta.date}</strong></> : "Model sıralamaları"}</span>
            </span>
            {meta.source && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: "var(--text-muted)" }}>Kaynak</span>
                <Badge variant="muted" size="sm">{meta.source}</Badge>
              </span>
            )}
            {!loading && !error && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: "var(--text-muted)" }}>Model</span>
                <strong className="tnum" style={{ color: "var(--text-primary)", fontWeight: 700 }}>{sorted.length}</strong>
              </span>
            )}
          </>
        }
      />

      {loading ? (
        <Card variant="feature" padded>
          <Skeleton lines={6} height={18} />
        </Card>
      ) : error ? (
        <Card variant="feature" padded>
          <EmptyState
            icon={<AlertTriangle size={22} strokeWidth={1.8} />}
            title="Sıralama yüklenemedi"
            description={error}
            action={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                <RefreshCw size={14} strokeWidth={2} /> Sayfayı yenileyince tekrar denenir
              </span>
            }
          />
        </Card>
      ) : sorted.length === 0 ? (
        <Card variant="feature" padded>
          <EmptyState
            icon={<Trophy size={22} strokeWidth={1.8} />}
            title="Henüz sıralama verisi yok"
            description="Model sıralama snapshot'ı oluşturulduğunda performans tablosu burada görünür."
          />
        </Card>
      ) : (
        <div style={{ background: "var(--gradient-surface), var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden", boxShadow: "var(--shadow-md), var(--highlight-top)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>
                <Th style={{ width: 64 }}>#</Th>
                <Th>Model</Th>
                <Th>Sağlayıcı</Th>
                <Th style={{ textAlign: "right", width: 90 }}>Skor</Th>
                <Th>En İyi Kullanım</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const displayRank = r.rank ?? idx + 1;
                return (
                  <tr
                    key={idx}
                    style={{ borderBottom: "1px solid var(--border)", transition: "background 0.12s var(--ease-out)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <RankMedal rank={r.rank} />
                        <span className="font-display tnum" style={{ fontWeight: 800, color: rankColor(r.rank), fontSize: "var(--text-md)", letterSpacing: "-0.02em" }}>{displayRank}</span>
                      </span>
                    </Td>
                    <Td><span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{name(r)}</span></Td>
                    <Td>{r.provider ? <Badge variant="default" size="sm">{r.provider}</Badge> : <span style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                    <Td style={{ textAlign: "right" }}>
                      {r.score != null ? <span className="font-display tnum" style={{ fontWeight: 800, color: "var(--accent-text)", letterSpacing: "-0.01em" }}>{r.score}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </Td>
                    <Td><span style={{ color: "var(--text-secondary)" }}>{resolveUseCase(r)}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      className="eyebrow"
      style={{
        padding: "11px 16px",
        textAlign: "left",
        fontSize: "var(--text-2xs)",
        color: "var(--text-muted)",
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--border-strong)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "12px 16px", verticalAlign: "middle", ...style }}>{children}</td>;
}
