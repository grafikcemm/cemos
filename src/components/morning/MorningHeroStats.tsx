"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";
import type { useDailyQueueData, MorningDraft } from "./useDailyQueueData";

/**
 * Tek satır sabah sayacı (FIRST-SPRINT item 1) — eski 3-tile hero'nun yerini
 * aldı: "N taslak seni bekliyor (grafikcem X · maskulenkod Y) · ● sağlıklı".
 * Aksiyon üstte, istatistik gürültüsü yok; sağlık tiki buradadır ve
 * OperatorReadinessGate yalnız SORUN varken genişler (item 2).
 */

type Readiness = {
  ready: boolean;
  readyWithWarning?: boolean;
};

const ACCOUNT_ORDER = ["grafikcem", "maskulenkod"] as const;

const isDone = (d: MorningDraft) =>
  d.status === "manual_published" || d.status === "published";

type Props = {
  queue: ReturnType<typeof useDailyQueueData>;
};

export default function MorningHeroStats({ queue }: Props) {
  const { drafts, loading } = queue;
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readinessFailed, setReadinessFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchJson<Readiness>("/api/settings/operator-readiness")
      .then((data) => {
        if (!cancelled) setReadiness(data);
      })
      .catch(() => {
        if (!cancelled) setReadinessFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pending = drafts.filter((d) => !isDone(d));
  const perAccount = ACCOUNT_ORDER.map((h) => ({
    handle: h,
    count: pending.filter((d) => d.accountHandle === h).length,
  }));

  const healthColor = readinessFailed
    ? "var(--text-muted)"
    : readiness == null
      ? "var(--text-muted)"
      : readiness.ready && !readiness.readyWithWarning
        ? "var(--green)"
        : readiness.ready
          ? "var(--yellow)"
          : "var(--danger)";
  const healthLabel = readinessFailed
    ? "durum alınamadı"
    : readiness == null
      ? "kontrol ediliyor"
      : readiness.ready && !readiness.readyWithWarning
        ? "sağlıklı"
        : readiness.ready
          ? "uyarılı"
          : "sorun var";

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
