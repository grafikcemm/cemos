"use client";

import { useEffect, useState, type CSSProperties } from "react";

type TraceStage = {
  stage: string;
  role: string;
  model: string;
  ok: boolean;
  failOpenUsed: boolean;
  ms: number;
  costUsd: number;
  score?: number;
  // Additive registry metadata (ADR-027) — eski kayıtlar taşımaz, hepsi opsiyonel.
  agentId?: string;
  agentVersion?: string;
  executionMode?: string;
  outcome?: string;
  fallbackUsed?: boolean;
  blockedReason?: string;
  retryCount?: number;
  policyVersion?: string;
};

type Trace = {
  id: string;
  platform: string;
  pipelineId: string;
  subjectType: string;
  subjectId: string;
  stages: TraceStage[];
  totalCostUsd: number;
  createdAt: string;
};

type Props = { subjectType: string; subjectId: string };

const muted: CSSProperties = { fontSize: 12, color: "var(--text-muted)", padding: 8 };
const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 12,
};

function badge(variant: "accent" | "red" | "yellow"): CSSProperties {
  const map = {
    accent: { color: "var(--accent)", bg: "var(--accent-tint-12)", border: "var(--accent-tint-20)" },
    red: { color: "var(--red)", bg: "color-mix(in srgb, var(--danger) 12%, transparent)", border: "color-mix(in srgb, var(--danger) 20%, transparent)" },
    yellow: { color: "var(--yellow)", bg: "color-mix(in srgb, var(--yellow) 12%, transparent)", border: "color-mix(in srgb, var(--yellow) 20%, transparent)" },
  }[variant];
  return {
    fontSize: 9,
    fontWeight: 500,
    color: map.color,
    background: map.bg,
    border: `1px solid ${map.border}`,
    borderRadius: 3,
    padding: "1px 5px",
  };
}

/** Faz G — reusable "pipeline izi" viewer. Embed per subject (brief/comment/dm). */
export default function PipelineTraceDrawer({ subjectType, subjectId }: Props) {
  const [traces, setTraces] = useState<Trace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!subjectId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetch(
      `/api/growth/pipeline-trace?subjectType=${encodeURIComponent(subjectType)}&subjectId=${encodeURIComponent(subjectId)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.success) setTraces(d.traces as Trace[]);
        else setError(d.error || "İz alınamadı");
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : "İz alınamadı"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subjectType, subjectId]);

  if (loading) return <div style={muted}>Pipeline izi yükleniyor…</div>;
  if (error) return <div style={{ ...muted, color: "var(--red)" }}>İz hatası: {error}</div>;
  if (!traces || traces.length === 0) return <div style={muted}>Henüz pipeline izi yok.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {traces.map((t) => (
        <div key={t.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)" }}>🧬 {t.pipelineId}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>${t.totalCostUsd.toFixed(4)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {t.stages.map((s, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={badge(s.ok ? "accent" : "red")}>{s.ok ? "✓" : "✗"}</span>
                  <span style={{ fontWeight: 500, color: "var(--text-primary)", minWidth: 64 }}>{s.stage}</span>
                  <span style={{ color: "var(--text-muted)" }}>{s.role}</span>
                  {s.failOpenUsed && <span style={badge("yellow")}>fail-open</span>}
                  <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
                    {s.ms}ms · ${s.costUsd.toFixed(4)}
                  </span>
                </div>
                {s.agentId && (
                  <div
                    data-testid="trace-agent-meta"
                    style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 28 }}
                  >
                    {s.agentId}@{s.agentVersion ?? "?"} · {s.executionMode ?? "?"} · {s.outcome ?? "?"}
                    {s.fallbackUsed ? " · deterministik fallback" : ""}
                    {s.blockedReason ? ` · engel: ${s.blockedReason}` : ""}
                    {typeof s.retryCount === "number" && s.retryCount > 0 ? ` · retry ${s.retryCount}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
