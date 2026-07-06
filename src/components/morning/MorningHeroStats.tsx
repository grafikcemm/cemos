"use client";

import { useEffect, useState } from "react";
import { PenLine, DollarSign, Activity, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";

type Readiness = {
  ready: boolean;
  readyWithWarning?: boolean;
  todayItemsCount: number;
  totalMonthCost: number;
  monthlyBudgetUSD?: number;
};

const DRAFT_TARGET = 2; // 2 hesap × 1 taslak/gün

type StatTone = "accent" | "amber" | "green" | "muted";

const TONE: Record<StatTone, { text: string; bg: string; border: string }> = {
  accent: { text: "var(--accent-text)", bg: "var(--accent-dark)", border: "var(--accent-border)" },
  amber: { text: "var(--accent-2-text)", bg: "var(--accent-2-dark)", border: "var(--accent-2-border)" },
  green: { text: "var(--green)", bg: "rgba(110, 141, 122,0.13)", border: "rgba(110, 141, 122,0.28)" },
  muted: { text: "var(--text-secondary)", bg: "var(--bg-hover)", border: "var(--border)" },
};

function StatTile({
  eyebrow,
  value,
  sub,
  tone,
  icon,
}: {
  eyebrow: string;
  value: string;
  sub?: string;
  tone: StatTone;
  icon: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "18px 20px",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-sunken)",
        border: "1px solid var(--border-faint)",
        overflow: "hidden",
      }}
    >
      {/* sol tone şeridi */}
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: t.text, opacity: 0.85 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-md)",
            display: "grid",
            placeItems: "center",
            background: t.bg,
            border: `1px solid ${t.border}`,
            color: t.text,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <span className="eyebrow" style={{ color: "var(--text-muted)" }}>
          {eyebrow}
        </span>
      </div>
      <div
        className="font-display tnum"
        style={{ fontSize: "var(--text-4xl)", fontWeight: 500, lineHeight: 1, letterSpacing: "-0.025em", color: t.text }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

/** Bugün ekranının hero stat şeridi — taslak / maliyet / sistem (3 tasarımlı tile). */
export default function MorningHeroStats() {
  const [data, setData] = useState<Readiness | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let mounted = true;
    setFailed(false);
    // fetchJson enforces a timeout, so this promise always settles — on failure
    // we flip to an error state (with retry) instead of hanging on "yükleniyor…".
    fetchJson<Readiness>("/api/settings/operator-readiness")
      .then((d) => mounted && setData(d))
      .catch(() => mounted && setFailed(true));
    return () => {
      mounted = false;
    };
  }, [reloadNonce]);

  const loading = !data && !failed;
  const drafts = data?.todayItemsCount ?? 0;
  const cost = data?.totalMonthCost ?? 0;
  const budget = data?.monthlyBudgetUSD;
  const statusReady = data?.ready === true && !data?.readyWithWarning;
  const statusWarn = data?.ready === true && data?.readyWithWarning === true;

  const placeholder = failed ? "—" : "–";
  const numSub = (base: string) => (failed ? "yüklenemedi" : loading ? "yükleniyor…" : base);

  const draftSub = numSub(drafts >= DRAFT_TARGET ? "hedef tamam ✓" : `${DRAFT_TARGET} hedefin ${drafts}'i`);
  const costSub = numSub(budget ? `$${budget} aylık bütçe` : "bu ay");
  const costTone: StatTone = failed ? "muted" : !budget ? "amber" : cost / budget > 0.85 ? "amber" : "green";
  const statusValue = failed ? "Hata" : loading ? "…" : statusReady ? "Hazır" : statusWarn ? "Uyarılı" : "Bekliyor";
  const statusTone: StatTone = failed ? "amber" : statusReady ? "green" : statusWarn ? "amber" : "muted";
  const statusSub = failed
    ? "durum alınamadı"
    : loading
      ? "yükleniyor…"
      : statusReady
        ? "tüm sistemler çalışıyor"
        : statusWarn
          ? "uyarılar var"
          : "üretim bekleniyor";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
        gap: 14,
        padding: 16,
        marginBottom: "var(--space-6)",
        borderRadius: "var(--radius-2xl)",
        background: "var(--gradient-surface), var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow-md), var(--highlight-top)",
      }}
    >
      <StatTile
        eyebrow="Bugünkü üretim"
        value={loading || failed ? placeholder : String(drafts)}
        sub={draftSub}
        tone="accent"
        icon={<PenLine size={16} strokeWidth={1.9} />}
      />
      <StatTile
        eyebrow="Bu ay maliyet"
        value={loading || failed ? placeholder : `$${cost.toFixed(2)}`}
        sub={costSub}
        tone={costTone}
        icon={<DollarSign size={16} strokeWidth={1.9} />}
      />
      <StatTile
        eyebrow="Sistem"
        value={statusValue}
        sub={statusSub}
        tone={statusTone}
        icon={<Activity size={16} strokeWidth={1.9} />}
      />
      {failed && (
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            Durum bilgisi yüklenemedi.
          </span>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontSize: "var(--text-sm)",
              cursor: "pointer",
            }}
          >
            <RotateCw size={14} strokeWidth={1.9} />
            Tekrar dene
          </button>
        </div>
      )}
    </div>
  );
}
