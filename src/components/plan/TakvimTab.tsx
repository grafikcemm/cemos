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
  StaleNotice,
  BlockedExternalState,
} from "@/components/ui";
import { useXAgentStore } from "@/store/xagent";
import PlanHandoffBand from "./PlanHandoffBand";
import PlanBuilder from "./PlanBuilder";
import PlanHealthStrip from "./PlanHealthStrip";
import SlotOpsBar from "./SlotOpsBar";
import { useActiveAccount } from "@/lib/accounts/useActiveAccount";
import { SlotDossierActions, DossierDetailPanel } from "./TakvimDossierPanels";
import {
  monthMatrix,
  monthLabel,
  daysInMonth,
  shiftMonth,
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
  slotUpdatedAt?: string;
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

type RawSlot = { id: string; dayOfMonth: number; pillar?: string; seriesKey?: string | null; topicHint?: string; status?: string; dossierId?: string | null; updatedAt?: string };
type RawQueue = { id: string; status: string; scheduledAt?: string | null; content?: string; editedContent?: string | null };

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
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  // WP-04 / P0 batch A1: yerel accountId seçici SİLİNDİ — TEK otorite global
  // activeChannel (useActiveAccount). Hook'un `channel`/`setChannel`'ı bu
  // dosyanın KENDİ `channel`/`setChannel`'ı (aşağıda — takvim kanal filtresi,
  // ayrı bir kavram) ile çakışmasın diye `handle`/`setAccountHandle` adıyla alınır.
  const {
    channel: handle,
    setChannel: setAccountHandle,
    accountId,
    channelUnknown,
    accounts,
    accountsLoading,
    accountsFailed,
    reloadAccounts,
  } = useActiveAccount();

  const today = useMemo(() => new Date(), []);
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
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [planUpdatedAt, setPlanUpdatedAt] = useState<string | null>(null);

  // Sonsuz-skeleton koruması (Faz 1D.1 + WP-04/P0 batch A1): hesap listesi
  // düştü/boş döndüyse YA DA channel çözülemiyorsa (channelUnknown — accountId
  // fail-closed null) load() hiç koşamaz — loading'i kapat ve dürüst hata
  // durumuna geç.
  useEffect(() => {
    if (!accountsLoading && (accountsFailed || accounts.length === 0 || channelUnknown)) {
      setLoading(false);
      if (accountsFailed || channelUnknown) setFailed(true);
    }
  }, [accountsLoading, accountsFailed, accounts.length, channelUnknown]);

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
          // Görünen ad: ham seriesKey değil, topicHint/pillar (seri slotu topicHint taşır).
          title: s.topicHint || s.pillar || "Reels",
          dossierId: s.dossierId,
          status: s.status,
          pillar: s.pillar,
          slotRawId: s.id,
          slotUpdatedAt: s.updatedAt,
          seriesKey: s.seriesKey ?? null,
          topicHint: s.topicHint,
        })),
      );
      setStaleFlags(plan.staleFlags ?? []);
      setPlanStatus(plan.plan?.status ?? plan.planStatus ?? null);
      setPlanUpdatedAt(plan.plan?.updatedAt ?? null);

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
                value={accountId ?? ""}
                onChange={(e) => {
                  // Two-way bind: dropdown id → handle → global switcher (setChannel).
                  const next = accounts.find((a) => a.id === e.target.value);
                  if (next) setAccountHandle(next.handle);
                }}
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

      {/* Plan sağlığı — canonical /api/health (Sistem ile aynı kaynak) */}
      {accountId && <PlanHealthStrip viewedMonth={monthStr} />}

      {staleFlags.length > 0 && (
        <StaleNotice
          ageLabel={`${staleFlags.length} dossier`}
          message="Bazı slotların araç kanıtı eski — yayınlamadan önce yeniden doğrula."
        />
      )}

      {channel === "instagram" && (
        <BlockedExternalState
          compact
          title="Instagram yayın/zamanlama CemOS dışında"
          description="Meta business_discovery ÇALIŞIYOR — rakip/ilham okuması yapılır. Ancak Instagram'a YAYIN/ZAMANLAMA (write) ayrı bir yetenektir ve şu an CemOS içinden desteklenmiyor; yayını manuel yürüt. Reels planı (bu ekranda) IG'ye yayın yapmaz, üretim planıdır."
          detail="Okuma aktif: META_ACCESS_TOKEN. Yayın için gerekli IG publishing izinleri henüz yok."
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
            if (accountsFailed || accounts.length === 0 || channelUnknown) reloadAccounts();
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
            <MonthGrid matrix={matrix} itemsByDay={itemsByDay} dossiers={dossiers} isCurrentMonth={isCurrentMonth} todayDay={today.getDate()} onDay={(day) => {
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

            {active.channel === "reels" && active.slotRawId && accountId && (
              <SlotOpsBar
                accountId={accountId}
                slotRawId={active.slotRawId}
                dayOfMonth={active.day}
                status={active.status ?? "planned"}
                updatedAt={active.slotUpdatedAt ?? null}
                daysInMonth={daysInMonth(year, month1)}
                onChanged={() => {
                  setActive(null);
                  void load();
                }}
              />
            )}

            {active.channel === "reels" ? (
              // FAIL-CLOSED: accountId null iken (channel geçiş anı) bu iki
              // panel de account-scoped fetch/mutation BAŞLATMAZ — render edilmez.
              accountId && activeDossier ? (
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
              ) : accountId ? (
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
              ) : null
            ) : (
              <>
                <DrawerField label="Taslak" value={active.content || "—"} multiline />
                {active.scheduledAt && <DrawerField label="Zamanlandı" value={new Date(active.scheduledAt).toLocaleString("tr-TR")} />}
              </>
            )}
          </div>
        )}
      </Drawer>

      {/* Aylık plan builder: önizle → uygula → ayrı aktive et (ADR-039 §11) */}
      <Drawer open={builderOpen} onClose={() => setBuilderOpen(false)} title="Aylık reels planı" width={520}>
        {accountId && (
          <PlanBuilder
            accountId={accountId}
            monthStr={monthStr}
            monthLabel={monthLabel(year, month1)}
            year={year}
            month1={month1}
            planStatus={planStatus}
            planUpdatedAt={planUpdatedAt}
            onApplied={() => {
              void load();
            }}
          />
        )}
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

/**
 * ADR-040: ay hücresi artık YALNIZ nokta değil — gerçek veri varsa kompakt satır
 * (readiness renk noktası + başlık/konu). Renk = dossier/slot durumu; içerik
 * uydurulmaz (dossier'sız planlı slot dürüstçe "planlı" nötr nokta). aria-label
 * SABİT `${gün} — ${sayı} öğe` (e2e kontratı — phase3b/3d/3e).
 */
type DotState = { color: string; muted?: boolean; struck?: boolean };
function itemDotState(it: CalItem, dossiers: Record<string, DossierRow>): DotState {
  if (it.status === "skipped") return { color: "var(--text-faint)", muted: true, struck: true };
  if (it.channel === "x") return { color: "var(--accent-text)" };
  const dos = it.dossierId ? dossiers[it.dossierId] : null;
  if (!dos) return { color: "var(--text-muted)" }; // planlı, dossier yok — dürüst nötr
  if (dos.finalReadiness === "ready") return { color: "var(--status-ok)" };
  if (dos.finalReadiness === "needs_verify") return { color: "var(--status-warn)" };
  return { color: "var(--status-error)" };
}

function CellItemRow({ it, dossiers }: { it: CalItem; dossiers: Record<string, DossierRow> }) {
  const d = itemDotState(it, dossiers);
  const label = it.title || CHANNEL_LABEL[it.channel];
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, width: "100%" }}>
      <span style={{ width: 6, height: 6, borderRadius: "var(--radius-pill)", background: d.color, flexShrink: 0 }} />
      <span
        style={{
          minWidth: 0,
          flex: 1,
          fontSize: "var(--text-2xs)",
          lineHeight: 1.3,
          color: d.muted ? "var(--text-faint)" : "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: d.struck ? "line-through" : undefined,
        }}
      >
        {it.time ? `${it.time} ` : ""}
        {label}
      </span>
    </span>
  );
}

function MonthGrid({
  matrix,
  itemsByDay,
  dossiers,
  isCurrentMonth,
  todayDay,
  onDay,
}: {
  matrix: ReturnType<typeof monthMatrix>;
  itemsByDay: Map<number, CalItem[]>;
  dossiers: Record<string, DossierRow>;
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
                minHeight: 104,
                display: "flex",
                flexDirection: "column",
                gap: 5,
                padding: "7px 8px",
                textAlign: "left",
                background: cell.inMonth ? "var(--bg-sunken)" : "transparent",
                border: `1px solid ${isToday ? "var(--accent-border)" : "var(--border-faint)"}`,
                borderRadius: "var(--radius-md)",
                cursor: clickable ? "pointer" : "default",
                opacity: cell.inMonth ? 1 : 0.4,
                overflow: "hidden",
              }}
            >
              <span
                className="tnum"
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: isToday ? 600 : 500,
                  color: isToday ? "var(--accent-text)" : cell.inMonth ? "var(--text-secondary)" : "var(--text-faint)",
                  flexShrink: 0,
                }}
              >
                {cell.day}
              </span>
              {items.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%", minWidth: 0 }}>
                  {items.slice(0, 2).map((it) => (
                    <CellItemRow key={it.id} it={it} dossiers={dossiers} />
                  ))}
                  {items.length > 2 && (
                    <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", paddingLeft: 11 }}>
                      +{items.length - 2} daha
                    </span>
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
