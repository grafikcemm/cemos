"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarPlus, Sparkles } from "lucide-react";
import {
  Card,
  Select,
  Button,
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
  Drawer,
  Textarea,
  StaleNotice,
  BlockedExternalState,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useXAgentStore } from "@/store/xagent";
import PlanHandoffBand from "./PlanHandoffBand";
import { useAccounts } from "./useAccounts";
import { SlotDossierActions, DossierDetailPanel } from "./TakvimDossierPanels";
import {
  monthMatrix,
  monthLabel,
  daysInMonth,
  shiftMonth,
  postDaysFromFrequency,
  TR_WEEKDAYS,
} from "@/lib/utils/calendarGrid";

/**
 * Plan / Takvim (05 §C1) — X, Instagram ve Reels yayın planı. Ay = YOĞUNLUK
 * (nokta, içerik önizlemesi yok); Hafta = kanal + saat + önizleme. Slot açılınca
 * dossier drawer. Kanal filtresi kalıcı renk-katmanı ÜRETMEZ (§C1 kabul).
 * Bare host: başlık + SubNav shell'de.
 *
 * Gerçek veri: Reels = ReelPlanSlot (GET /api/reels/plan) · X = zamanlanmış
 * QueueItem (GET /api/queue) · Instagram = Meta üzerinden manuel (dürüst not).
 * Ölü "+ Slot" YOK — gerçek, düzenlenebilir aylık reels planı oluşturucu.
 */

type Channel = "all" | "x" | "instagram" | "reels";
type ViewMode = "month" | "week";

export type CalItem = {
  id: string;
  channel: "x" | "reels";
  day: number;
  time?: string;
  title: string;
  dossierId?: string | null;
  status?: string;
  pillar?: string;
  content?: string;
  scheduledAt?: string;
  /** Reels slotu için ham ReelPlanSlot id'si + üretim prefill'i (ADR-036 §H). */
  slotRawId?: string;
  seriesKey?: string | null;
  topicHint?: string;
};

type DossierRow = {
  id: string;
  title: string;
  pillar: string;
  format: string;
  hook: string;
  finalReadiness: "ready" | "needs_verify" | "not_ready";
  expiry: string | null;
  costUsd: number;
};

type RawSlot = { id: string; dayOfMonth: number; pillar?: string; seriesKey?: string | null; topicHint?: string; status?: string; dossierId?: string | null };
type RawQueue = { id: string; status: string; scheduledAt?: string | null; content?: string; editedContent?: string | null };

const DEFAULT_PILLARS = ["ai_prompt_reveal", "site_turu", "arac_demo", "palet_reveal"];
const CHANNEL_LABEL: Record<"x" | "reels", string> = { x: "X", reels: "Reels" };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const READINESS_META: Record<DossierRow["finalReadiness"], { label: string; variant: "success" | "yellow" | "danger" }> = {
  ready: { label: "kontrolleri geçti", variant: "success" },
  needs_verify: { label: "yeniden doğrula", variant: "yellow" },
  not_ready: { label: "hazır değil", variant: "danger" },
};

export default function TakvimTab() {
  const toast = useToast();
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const { accounts, loading: accountsLoading, failed: accountsFailed, reload: reloadAccounts } = useAccounts();

  const today = useMemo(() => new Date(), []);
  const [accountId, setAccountId] = useState("");
  const [view, setView] = useState<ViewMode>("month");
  const [channel, setChannel] = useState<Channel>("all");
  const [year, setYear] = useState(today.getFullYear());
  const [month1, setMonth1] = useState(today.getMonth() + 1);

  const [slots, setSlots] = useState<CalItem[]>([]);
  const [scheduled, setScheduled] = useState<CalItem[]>([]);
  const [dossiers, setDossiers] = useState<Record<string, DossierRow>>({});
  const [staleFlags, setStaleFlags] = useState<{ dossierId: string; title: string; message: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [active, setActive] = useState<CalItem | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pillarText, setPillarText] = useState(DEFAULT_PILLARS.join("\n"));
  const [frequency, setFrequency] = useState("3");
  const [busy, setBusy] = useState(false);

  // Hesap seçilince ilkini kur.
  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  // Sonsuz-skeleton koruması (Faz 1D.1): hesap listesi düştü ya da boş döndüyse
  // load() hiç koşamaz — loading'i kapat ve dürüst hata/boş duruma geç.
  useEffect(() => {
    if (!accountsLoading && (accountsFailed || accounts.length === 0)) {
      setLoading(false);
      if (accountsFailed) setFailed(true);
    }
  }, [accountsLoading, accountsFailed, accounts.length]);

  const handle = accounts.find((a) => a.id === accountId)?.handle ?? "";
  const monthStr = `${year}-${pad(month1)}`;

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setFailed(false);
    try {
      const [planRes, queueRes, dosRes] = await Promise.all([
        fetch(`/api/reels/plan?accountId=${encodeURIComponent(accountId)}&month=${monthStr}`),
        handle ? fetch(`/api/queue?account=${encodeURIComponent(handle)}`).catch(() => null) : Promise.resolve(null),
        fetch(`/api/reels/dossier?accountId=${encodeURIComponent(accountId)}`).catch(() => null),
      ]);
      if (!planRes.ok) throw new Error("http");
      const plan = await planRes.json();
      if (!plan.success) throw new Error("payload");

      const rawSlots: RawSlot[] = plan.plan?.slots ?? [];
      setSlots(
        rawSlots.map((s) => ({
          id: `slot-${s.id}`,
          channel: "reels" as const,
          day: s.dayOfMonth,
          title: s.seriesKey ? `Seri: ${s.seriesKey}` : s.topicHint || s.pillar || "Reels",
          dossierId: s.dossierId,
          status: s.status,
          pillar: s.pillar,
          slotRawId: s.id,
          seriesKey: s.seriesKey ?? null,
          topicHint: s.topicHint,
        })),
      );
      setStaleFlags(plan.staleFlags ?? []);

      // Zamanlanmış X taslakları (bu ay).
      let sched: CalItem[] = [];
      if (queueRes?.ok) {
        const q = await queueRes.json();
        const items: RawQueue[] = q.items ?? [];
        sched = items
          .filter((it) => it.status === "scheduled" && it.scheduledAt)
          .map((it) => {
            const dt = new Date(it.scheduledAt as string);
            return { it, dt };
          })
          .filter(({ dt }) => dt.getFullYear() === year && dt.getMonth() + 1 === month1)
          .map(({ it, dt }) => ({
            id: `q-${it.id}`,
            channel: "x" as const,
            day: dt.getDate(),
            time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
            title: (it.editedContent || it.content || "").slice(0, 80),
            content: it.editedContent || it.content || "",
            scheduledAt: it.scheduledAt as string,
            status: it.status,
          }));
      }
      setScheduled(sched);

      if (dosRes?.ok) {
        const d = await dosRes.json();
        const map: Record<string, DossierRow> = {};
        for (const row of (d.dossiers ?? []) as DossierRow[]) map[row.id] = row;
        setDossiers(map);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accountId, handle, monthStr, year, month1]);

  useEffect(() => {
    load();
  }, [load]);

  const allItems = useMemo(() => [...slots, ...scheduled], [slots, scheduled]);
  const filtered = useMemo(() => {
    if (channel === "all") return allItems;
    if (channel === "instagram") return [];
    return allItems.filter((i) => i.channel === channel);
  }, [allItems, channel]);

  const itemsByDay = useMemo(() => {
    const m = new Map<number, CalItem[]>();
    for (const it of filtered) {
      const arr = m.get(it.day);
      m.set(it.day, arr ? [...arr, it] : [it]);
    }
    return m;
  }, [filtered]);

  const nav = (delta: number) => {
    const next = shiftMonth(year, month1, delta);
    setYear(next.year);
    setMonth1(next.month1);
  };

  const createPlan = async () => {
    if (!accountId) return;
    const pillars = pillarText
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (pillars.length < 3 || pillars.length > 5) {
      toast.error("3–5 sütun (pillar) gerekli.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reels/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          month: monthStr,
          postDays: postDaysFromFrequency(Number(frequency), year, month1),
          pillars,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`Reels planı kuruldu: ${json.slotCount} slot.`);
        setBuilderOpen(false);
        await load();
      } else {
        toast.error(json.error ?? "Plan kurulamadı.");
      }
    } catch {
      toast.error("Plan kurulamadı (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  const activeDossier = active?.dossierId ? dossiers[active.dossierId] : null;
  const dossierStale = activeDossier?.expiry ? Date.parse(activeDossier.expiry) < today.getTime() : false;

  const matrix = useMemo(() => monthMatrix(year, month1), [year, month1]);
  const isCurrentMonth = year === today.getFullYear() && month1 === today.getMonth() + 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
      {/* Toolbar */}
      <Card variant="quiet" padded>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Görünüm */}
          <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--bg-sunken)", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-faint)" }}>
            {(["month", "week"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                data-testid={`takvim-view-${v}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-pill)",
                  border: "none",
                  background: view === v ? "var(--bg-elevated)" : "transparent",
                  color: view === v ? "var(--text-primary)" : "var(--text-secondary)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {v === "month" ? "Ay" : "Hafta"}
              </button>
            ))}
          </div>
          {/* Kanal */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(["all", "x", "instagram", "reels"] as Channel[]).map((c) => {
              const active = channel === c;
              const label = c === "all" ? "Tümü" : c === "x" ? "X" : c === "instagram" ? "Instagram" : "Reels";
              return (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  aria-pressed={active}
                  data-testid={`takvim-channel-${c}`}
                  style={{
                    padding: "7px 13px",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
                    background: active ? "var(--accent-dark)" : "transparent",
                    color: active ? "var(--accent-text)" : "var(--text-secondary)",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {accounts.length > 0 && (
              <Select
                aria-label="Hesap"
                options={accounts.map((a) => ({ value: a.id, label: `@${a.handle}` }))}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              />
            )}
            <Button size="sm" variant="primary" onClick={() => setBuilderOpen(true)} iconLeft={<CalendarPlus size={14} strokeWidth={2} />} data-testid="takvim-plan-open">
              Reels planı
            </Button>
          </div>
        </div>
      </Card>

      {/* Fırsattan gelen bekleyen plan aktarımları (ADR-028) — reload-persist */}
      {accountId && (
        <PlanHandoffBand
          accountId={accountId}
          year={year}
          month1={month1}
          monthStr={monthStr}
          onPlaced={load}
          onNeedPlan={() => setBuilderOpen(true)}
        />
      )}

      {staleFlags.length > 0 && (
        <StaleNotice
          ageLabel={`${staleFlags.length} dossier`}
          message="Bazı slotların araç kanıtı eski — yayınlamadan önce yeniden doğrula."
        />
      )}

      {channel === "instagram" && (
        <BlockedExternalState
          compact
          title="Instagram yayın planı manuel"
          description="Instagram zamanlaması Meta izni gerektirir (business_discovery). Şu an IG yayınları CemOS içinden planlanamıyor; Meta üzerinden manuel yürüt."
          detail="Gerekli: META_ACCESS_TOKEN + instagram_basic / business_discovery izni."
        />
      )}

      {/* Takvim gövdesi */}
      {loading ? (
        <Card padded>
          <Skeleton width={180} height={16} style={{ marginBottom: 16 }} />
          <Skeleton lines={6} />
        </Card>
      ) : failed ? (
        <ErrorState
          title="Plan yüklenemedi"
          description="Takvim verisi getirilemedi. Yeniden dene."
          onRetry={() => {
            setFailed(false);
            setLoading(true);
            if (accountsFailed || accounts.length === 0) reloadAccounts();
            else load();
          }}
        />
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus size={22} strokeWidth={1.8} />}
          title="Bu ay planlı içerik yok"
          description="Fırsatlardan içerik ekleyerek ya da aylık reels planı oluşturarak başla."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="primary" onClick={() => setBuilderOpen(true)} iconLeft={<CalendarPlus size={15} strokeWidth={2} />}>
                Reels planı oluştur
              </Button>
              <Button variant="secondary" onClick={() => setActiveTab("plan-firsatlar")} iconLeft={<Sparkles size={15} strokeWidth={2} />}>
                Fırsatlardan ekle
              </Button>
            </div>
          }
        />
      ) : (
        <Card padded>
          {/* Ay başlığı + nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <h3 className="font-display" style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 500, color: "var(--text-primary)" }}>
              {monthLabel(year, month1)}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                {filtered.length} planlı öğe
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <IconNav dir="prev" onClick={() => nav(-1)} />
                <IconNav dir="next" onClick={() => nav(1)} />
              </div>
            </div>
          </div>

          {view === "month" ? (
            <MonthGrid matrix={matrix} itemsByDay={itemsByDay} isCurrentMonth={isCurrentMonth} todayDay={today.getDate()} onDay={(day) => {
              const first = itemsByDay.get(day)?.[0];
              if (first) setActive(first);
            }} />
          ) : (
            <WeekAgenda items={filtered} year={year} month1={month1} onOpen={setActive} />
          )}
        </Card>
      )}

      {/* Slot/öğe detay drawer */}
      <Drawer open={!!active} onClose={() => setActive(null)} title={active?.channel === "reels" ? "Reels slotu" : "Zamanlanmış X taslağı"} width={520}>
        {active && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge variant="accent" size="sm">{CHANNEL_LABEL[active.channel]}</Badge>
              <Badge variant="muted" size="sm">gün {active.day}</Badge>
              {active.time && <Badge variant="muted" size="sm">{active.time}</Badge>}
              {active.status && <Badge variant="muted" size="sm">{active.status}</Badge>}
            </div>

            {active.channel === "reels" ? (
              activeDossier ? (
                <>
                  {dossierStale && <StaleNotice message="Bu dossier'in araç kanıtı süresi geçmiş — yayından önce yeniden doğrula." />}
                  <DrawerField label="Başlık" value={activeDossier.title} />
                  <DrawerField label="Sütun" value={activeDossier.pillar} />
                  <DrawerField label="Format" value={activeDossier.format} />
                  <DrawerField label="Hook" value={activeDossier.hook} multiline />
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Site kanıtı</span>
                    <Badge variant={READINESS_META[activeDossier.finalReadiness].variant} size="sm">
                      {READINESS_META[activeDossier.finalReadiness].label}
                    </Badge>
                  </div>
                  {/* ADR-038 §G: tam detay + production-state read model — canlı fetch */}
                  <DossierDetailPanel
                    accountId={accountId}
                    dossierId={activeDossier.id}
                    slotRawId={active.slotRawId}
                    onDetached={() => {
                      setActive(null);
                      void load();
                    }}
                  />
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    Not: araç adlı dossier geçerli site kanıtı olmadan &quot;kontrolleri geçti&quot; görünmez;
                    site kanıtı editoryal onay DEĞİLDİR.
                  </p>
                </>
              ) : (
                <SlotDossierActions
                  accountId={accountId}
                  slot={active}
                  availableDossiers={Object.values(dossiers)}
                  // Drawer bilinçli AÇIK kalır: "bağlandı ama hazır değil"
                  // uyarısı kapanmadan okunabilmeli (ADR-038 §F dürüstlüğü).
                  onDone={() => {
                    void load();
                  }}
                />
              )
            ) : (
              <>
                <DrawerField label="Taslak" value={active.content || "—"} multiline />
                {active.scheduledAt && <DrawerField label="Zamanlandı" value={new Date(active.scheduledAt).toLocaleString("tr-TR")} />}
              </>
            )}
          </div>
        )}
      </Drawer>

      {/* Reels planı oluşturucu drawer (gerçek + düzenlenebilir) */}
      <Drawer open={builderOpen} onClose={() => setBuilderOpen(false)} title="Aylık reels planı oluştur" width={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            Deterministik montaj: %60 evergreen / %25 seasonal / %15 reactive (±10p). Mevcut &quot;planlı&quot; slotlar
            yeniden kurulur; işlenmiş (drafted/done) slotlar korunur.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Sütunlar (pillar) — her satıra bir tane, 3–5 arası
            </span>
            <Textarea value={pillarText} onChange={(e) => setPillarText(e.target.value)} rows={5} aria-label="Sütunlar" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sıklık</span>
            <Select
              aria-label="Sıklık"
              options={[
                { value: "2", label: "2 günde bir" },
                { value: "3", label: "3 günde bir" },
                { value: "4", label: "4 günde bir" },
              ]}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
            <Button variant="primary" onClick={createPlan} loading={busy} data-testid="takvim-plan-create">
              Planı oluştur ({monthLabel(year, month1)})
            </Button>
            <Button variant="ghost" onClick={() => setBuilderOpen(false)}>Vazgeç</Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

function IconNav({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === "prev" ? "Önceki ay" : "Sonraki ay"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        color: "var(--text-secondary)",
        cursor: "pointer",
      }}
    >
      {dir === "prev" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );
}

function DrawerField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: multiline ? 1.6 : 1.4, whiteSpace: multiline ? "pre-wrap" : "normal" }}>{value}</div>
    </div>
  );
}

function MonthGrid({
  matrix,
  itemsByDay,
  isCurrentMonth,
  todayDay,
  onDay,
}: {
  matrix: ReturnType<typeof monthMatrix>;
  itemsByDay: Map<number, CalItem[]>;
  isCurrentMonth: boolean;
  todayDay: number;
  onDay: (day: number) => void;
}) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {TR_WEEKDAYS.map((w) => (
          <div key={w} style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 4px" }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {matrix.map((cell, i) => {
          const items = cell.inMonth ? itemsByDay.get(cell.day) ?? [] : [];
          const isToday = cell.inMonth && isCurrentMonth && cell.day === todayDay;
          const clickable = items.length > 0;
          return (
            <button
              key={`${cell.iso}-${i}`}
              onClick={clickable ? () => onDay(cell.day) : undefined}
              disabled={!clickable}
              aria-label={`${cell.day} — ${items.length} öğe`}
              style={{
                minHeight: 86,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "8px 9px",
                textAlign: "left",
                background: cell.inMonth ? "var(--bg-sunken)" : "transparent",
                border: `1px solid ${isToday ? "var(--accent-border)" : "var(--border-faint)"}`,
                borderRadius: "var(--radius-md)",
                cursor: clickable ? "pointer" : "default",
                opacity: cell.inMonth ? 1 : 0.4,
              }}
            >
              <span
                className="tnum"
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: isToday ? 600 : 500,
                  color: isToday ? "var(--accent-text)" : cell.inMonth ? "var(--text-secondary)" : "var(--text-faint)",
                }}
              >
                {cell.day}
              </span>
              {items.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
                  {items.slice(0, 3).map((it) => (
                    <span key={it.id} style={{ width: 6, height: 6, borderRadius: "var(--radius-pill)", background: "var(--accent)" }} />
                  ))}
                  {items.length > 3 && (
                    <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>+{items.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekAgenda({ items, onOpen }: { items: CalItem[]; year: number; month1: number; onOpen: (i: CalItem) => void }) {
  const byDay = useMemo(() => {
    const m = new Map<number, CalItem[]>();
    for (const it of items) {
      const arr = m.get(it.day);
      m.set(it.day, arr ? [...arr, it] : [it]);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [items]);

  if (byDay.length === 0) {
    return <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Bu filtrede planlı öğe yok.</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {byDay.map(([day, dayItems]) => (
        <div key={day}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 6, fontWeight: 500 }}>{day}. gün</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dayItems.map((it) => (
              <button
                key={it.id}
                onClick={() => onOpen(it)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  textAlign: "left",
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--border-faint)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Badge variant="accent" size="sm">{CHANNEL_LABEL[it.channel]}</Badge>
                {it.time && <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{it.time}</span>}
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.title || "—"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
