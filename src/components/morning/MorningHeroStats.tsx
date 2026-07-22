"use client";

import { healthDotColor } from "@/lib/services/systemHealth";
import { deriveHealthProblems, healthProblemsLevel } from "@/lib/health/healthContracts";
import { useSystemHealth } from "@/components/shell/SystemHealthProvider";
import type { useDailyQueueData, MorningDraft } from "./useDailyQueueData";

/**
 * Tek satır sabah sayacı (FIRST-SPRINT item 1) — "N taslak seni bekliyor
 * (grafikcem X · maskulenkod Y) · ● sağlıklı". Sağlık tiki §8C uyarınca TOPBAR
 * chip'iyle AYNI kaynaktan (SystemHealthProvider) beslenir → Bugün özeti ile
 * topbar çelişemez. Üretim/operator hazırlığı AYRI eksendir (OperatorReadinessGate,
 * yalnız sorun varken genişler).
 */

const ACCOUNT_ORDER = ["grafikcem", "maskulenkod"] as const;

const isDone = (d: MorningDraft) =>
  d.status === "manual_published" || d.status === "published";

type Props = {
  queue: ReturnType<typeof useDailyQueueData>;
};

export default function MorningHeroStats({ queue }: Props) {
  const { drafts, loading } = queue;
  const { result: health, contracts } = useSystemHealth();

  const pending = drafts.filter((d) => !isDone(d));
  const perAccount = ACCOUNT_ORDER.map((h) => ({
    handle: h,
    count: pending.filter((d) => d.accountHandle === h).length,
  }));

  // §8C: sağlık tiki topbar chip ile AYNI canonical infra+akış sinyalini gösterir
  // (cronAuth / newsPipeline / metaToken / credential dahil). Eski dar `result`
  // türetimi bu kategorileri atlıyordu → gerçek infra sorununda fake-green. Yükleme/
  // erişilemez durumları hâlâ result state'ten (contracts henüz yok).
  const problems = contracts ? deriveHealthProblems(contracts) : [];
  const level = healthProblemsLevel(problems);
  const useLegacyHealth = health.state === "checking" || health.state === "unavailable" || !contracts;
  const healthColor = useLegacyHealth
    ? healthDotColor(health)
    : level === "error"
      ? "var(--status-error)"
      : level === "warn"
        ? "var(--status-warn)"
        : "var(--status-ok)";
  const healthLabel = useLegacyHealth
    ? health.label
    : level === "ok"
      ? "sağlıklı"
      : problems.length === 1
        ? problems[0].label
        : `${problems.length} sorun`;

  const headline = loading
    ? "Taslaklar yükleniyor…"
    : pending.length === 0
      ? drafts.length > 0
        ? "Bugünün taslakları tamam"
        : "Bugün bekleyen taslak yok"
      : `${pending.length} taslak seni bekliyor`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "10px 14px",
        marginBottom: "var(--space-4)",
        background: "var(--gradient-surface), var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm), var(--highlight-top)",
        fontSize: "var(--text-sm)",
      }}
    >
      <span className="font-display" style={{ fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
        {headline}
      </span>
      {!loading && pending.length > 0 && (
        <span className="tnum" style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>
          ({perAccount.map((a) => `${a.handle} ${a.count}`).join(" · ")})
        </span>
      )}
      <span
        data-testid="morning-health-tick"
        data-health-state={health.state}
        style={{
          marginLeft: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: "var(--text-xs)",
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: healthColor, flexShrink: 0 }} />
        {healthLabel}
      </span>
    </div>
  );
}
