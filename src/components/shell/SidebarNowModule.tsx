"use client";

import { Sparkles, Inbox, CalendarCheck, Activity, type LucideIcon } from "lucide-react";
import { useSystemHealth } from "./SystemHealthProvider";

/**
 * ADR-040 — sidebar "Şimdi" özeti. Profil'in ÜSTÜNDE, gerçek/canonical
 * SystemHealthProvider verisinden beslenir (TEK fetch reuse — N+1 YOK, ayrı
 * readiness sözlüğü YOK). Yalnız operatörün bir sonraki eylemini yönlendiren
 * dürüst sayılar: yayına hazır taslak, karar bekleyen iş, aktif planın hazır/
 * toplam durumu ve en yüksek öncelikli sistem sinyali. Sahte sayı / rastgele
 * rozet / dekoratif KPI YOK. Veri yoksa dürüst boş/bilinmiyor durumu.
 */

type NowModuleProps = {
  onNavigate: (tabId: string) => void;
};

export default function SidebarNowModule({ onNavigate }: NowModuleProps) {
  const { result, contracts } = useSystemHealth();

  // Durum henüz alınmadı → dürüst yükleniyor izi (sahte "0" gösterme).
  if (result.state === "checking") {
    return (
      <NowShell>
        <div className="cx-now-empty">Durum yükleniyor…</div>
      </NowShell>
    );
  }
  // Health fetch başarısız → dürüst "alınamadı" (sayı UYDURMA).
  if (result.state === "unavailable" || !contracts) {
    return (
      <NowShell>
        <div className="cx-now-empty">Durum alınamadı.</div>
      </NowShell>
    );
  }

  const today = contracts.todayReadiness.counts;
  const plan = contracts.instagramPlanning;
  const topbar = contracts.topbar;

  const rows: NowRowData[] = [];

  // 1. Yayına hazır taslak (0 dürüst bir bilgidir — gizleme). → Bugün
  if (today) {
    rows.push({
      icon: Sparkles,
      label: "Yayına hazır",
      value: `${today.ready}`,
      tone: today.ready > 0 ? "accent" : "muted",
      target: "morning",
    });
    // 2. Karar bekleyen iş — yalnız varsa (gürültü değil). → Bugün
    if (today.awaitingDecision > 0) {
      rows.push({
        icon: Inbox,
        label: "Karar bekleyen",
        value: `${today.awaitingDecision}`,
        tone: "warn",
        target: "morning",
      });
    }
  }

  // 3. Aktif Instagram planı — YALNIZ yapılandırılmışsa (opsiyonel). → Takvim
  if (plan && plan.configured) {
    const c = plan.counts;
    const isDraft = plan.planStatus === "draft";
    rows.push({
      icon: CalendarCheck,
      label: isDraft ? "Taslak plan" : "Aktif plan",
      value: `${c.productionReady}/${c.totalActiveSlots}`,
      tone: c.totalActiveSlots > 0 && c.productionReady < c.totalActiveSlots ? "warn" : "muted",
      target: "plan-takvim",
    });
  }

  // 4. En yüksek öncelikli sistem sinyali — actionable ise; değilse sessiz ok. → Sistem
  const sysTone = topbar.level === "error" ? "error" : topbar.level === "warn" ? "warn" : topbar.level === "action" ? "accent" : "ok";
  rows.push({
    icon: Activity,
    label: "Sistem",
    value: topbar.level === "none" ? "sağlıklı" : topbar.label,
    valueIsText: true,
    tone: sysTone,
    target: "system",
  });

  return (
    <NowShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map((r) => (
          <NowRow key={`${r.label}-${r.target}`} data={r} onClick={() => onNavigate(r.target)} />
        ))}
      </div>
    </NowShell>
  );
}

function NowShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cx-now" data-testid="sidebar-now">
      <div className="cx-section-label" style={{ margin: "0 0 6px", padding: "0 4px" }}>
        Şimdi
      </div>
      {children}
    </div>
  );
}

type NowTone = "accent" | "warn" | "error" | "ok" | "muted";
type NowRowData = {
  icon: LucideIcon;
  label: string;
  value: string;
  valueIsText?: boolean;
  tone: NowTone;
  target: string;
};

const TONE_COLOR: Record<NowTone, string> = {
  accent: "var(--accent-text)",
  warn: "var(--status-warn-text)",
  error: "var(--status-error)",
  ok: "var(--status-ok-text)",
  muted: "var(--text-muted)",
};

function NowRow({ data, onClick }: { data: NowRowData; onClick: () => void }) {
  const Icon = data.icon;
  const color = TONE_COLOR[data.tone];
  return (
    <button
      type="button"
      data-testid={`sidebar-now-${data.target}`}
      onClick={onClick}
      className="cx-now-row"
      aria-label={`${data.label}: ${data.value} — aç`}
    >
      <Icon size={14} strokeWidth={2} style={{ color, flexShrink: 0 }} aria-hidden />
      <span className="cx-now-row-label">{data.label}</span>
      <span
        className={data.valueIsText ? undefined : "tnum"}
        style={{
          color: data.tone === "muted" ? "var(--text-secondary)" : color,
          fontSize: data.valueIsText ? "var(--text-2xs)" : "var(--text-sm)",
          fontWeight: 600,
          maxWidth: data.valueIsText ? 92 : undefined,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {data.value}
      </span>
    </button>
  );
}
