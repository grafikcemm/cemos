"use client";

import { useEffect, useState } from "react";
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

const TONE_TEXT: Record<StatTone, string> = {
  accent: "var(--accent-text)",
  amber: "var(--accent-2-text)",
  green: "var(--green)",
  muted: "var(--text-secondary)",
};

function Stat({
  eyebrow,
  value,
  sub,
  tone,
  dot,
}: {
  eyebrow: string;
  value: string;
  sub?: string;
  tone: StatTone;
  dot?: boolean;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: "4px 4px" }}>
      <div className="eyebrow" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        {dot && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: TONE_TEXT[tone],
              boxShadow: `0 0 0 3px color-mix(in srgb, ${TONE_TEXT[tone]} 22%, transparent)`,
            }}
          />
        )}
        {eyebrow}
      </div>
      <div
        className="font-display tnum"
        style={{
          fontSize: "var(--text-4xl)",
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          color: TONE_TEXT[tone],
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 8, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{sub}</div>
      )}
    </div>
  );
}

/** Bugün ekranının editöryal hero stat şeridi — taslak / maliyet / sistem (tek bant). */
export default function MorningHeroStats() {
  const [data, setData] = useState<Readiness | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchJson<Readiness>("/api/settings/operator-readiness")
      .then((d) => mounted && setData(d))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const loading = !data;
  const drafts = data?.todayItemsCount ?? 0;
  const cost = data?.totalMonthCost ?? 0;
  const budget = data?.monthlyBudgetUSD;
  const statusReady = data?.ready === true && !data?.readyWithWarning;
  const statusWarn = data?.ready === true && data?.readyWithWarning === true;

  const draftSub = loading ? "yükleniyor…" : drafts >= DRAFT_TARGET ? "hedef tamam ✓" : `${DRAFT_TARGET} hedefin ${drafts}'i`;
  const costSub = loading ? "yükleniyor…" : budget ? `$${budget} aylık bütçe` : "bu ay";
  const costTone: StatTone = !budget ? "amber" : cost / budget > 0.85 ? "amber" : "green";
  const statusValue = loading ? "…" : statusReady ? "Hazır" : statusWarn ? "Uyarılı" : "Bekliyor";
  const statusTone: StatTone = statusReady ? "green" : statusWarn ? "amber" : "muted";
  const statusSub = loading ? "yükleniyor…" : statusReady ? "tüm sistemler çalışıyor" : statusWarn ? "uyarılar var" : "üretim bekleniyor";

  const divider = <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)", flexShrink: 0 }} />;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 24,
        padding: "24px 28px",
        marginBottom: "var(--space-6)",
        borderRadius: "var(--radius-2xl)",
        background: "var(--gradient-hero), var(--gradient-surface), var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow-md), var(--highlight-top)",
      }}
    >
      <Stat eyebrow="Bugünkü üretim" value={loading ? "–" : String(drafts)} sub={draftSub} tone="accent" />
      {divider}
      <Stat eyebrow="Bu ay maliyet" value={loading ? "–" : `$${cost.toFixed(2)}`} sub={costSub} tone={costTone} />
      {divider}
      <Stat eyebrow="Sistem" value={statusValue} sub={statusSub} tone={statusTone} dot={!loading} />
    </div>
  );
}
