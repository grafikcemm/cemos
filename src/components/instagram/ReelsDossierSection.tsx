"use client";

import { useCallback, useEffect, useState } from "react";
import { Clapperboard, ShieldCheck, ShieldAlert, ShieldQuestion, Plus, CalendarDays } from "lucide-react";
import { Card, SectionHeader, EmptyState, Badge, Button, Skeleton, TimelineLane } from "@/components/ui";
import type { TimelineLaneItem } from "@/components/ui";
import ErrorState from "@/components/ui/ErrorState";

/**
 * Reels Dosyaları (Sprint 8 — CONTENT-ENGINE §4/§6, D1: dossier listesi ÖNCE,
 * ay grid'i sonra). Doğrulanmış-araç rozeti hero öğedir: ready | needs_verify
 * (yeniden doğrula) | not_ready. 4 durum tasarımlı.
 */

type DossierRow = {
  id: string;
  accountId: string;
  title: string;
  pillar: string;
  format: string;
  hook: string;
  finalReadiness: "ready" | "needs_verify" | "not_ready";
  verificationId: string | null;
  expiry: string | null;
  costUsd: number;
  createdAt: string;
};

type AccountOpt = { id: string; handle: string };

type PlanSlotRow = {
  id: string;
  dayOfMonth: number;
  pillar: string;
  mixBucket: string;
  seriesKey: string | null;
  topicHint: string;
  status: string;
};

const READINESS: Record<
  DossierRow["finalReadiness"],
  { label: string; variant: "success" | "yellow" | "danger"; icon: React.ReactNode }
> = {
  ready: { label: "doğrulandı", variant: "success", icon: <ShieldCheck size={13} strokeWidth={2} /> },
  needs_verify: { label: "yeniden doğrula", variant: "yellow", icon: <ShieldQuestion size={13} strokeWidth={2} /> },
  not_ready: { label: "hazır değil", variant: "danger", icon: <ShieldAlert size={13} strokeWidth={2} /> },
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

/**
 * Ay planı slotlarını pillar-bazlı TimelineLane şeritlerine dönüştürür
 * (yalnız sunum — veri/mantık aynı). Ton eşlemesi semantik:
 * mor (accent) = seri slotu, turuncu (accent-2) = evergreen üretim,
 * info = diğer (seasonal/reactive).
 */
function slotsToLanes(slots: PlanSlotRow[]): { label: string; items: TimelineLaneItem[] }[] {
  const lanes = new Map<string, TimelineLaneItem[]>();
  for (const s of slots) {
    const label = s.pillar || "plan";
    const tone: TimelineLaneItem["tone"] = s.seriesKey
      ? "accent"
      : s.mixBucket === "evergreen"
        ? "accent-2"
        : "info";
    const title = s.seriesKey ? `seri: ${s.seriesKey}` : s.topicHint || s.mixBucket;
    const existing = lanes.get(label);
    const item: TimelineLaneItem = { id: s.id, day: s.dayOfMonth, title, tone };
    lanes.set(label, existing ? [...existing, item] : [item]);
  }
  return Array.from(lanes.entries()).map(([label, items]) => ({ label, items }));
}

export default function ReelsDossierSection() {
  const [dossiers, setDossiers] = useState<DossierRow[] | null>(null);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [planSlots, setPlanSlots] = useState<PlanSlotRow[] | null>(null);
  const [staleCount, setStaleCount] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [accountId, setAccountId] = useState("");
  const [topic, setTopic] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolUrl, setToolUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [dRes, sRes] = await Promise.all([
        fetch("/api/reels/dossier"),
        fetch("/api/settings").catch(() => null),
      ]);
      if (!dRes.ok) throw new Error("http");
      const d = await dRes.json();
      if (!d.success) throw new Error("payload");
      setDossiers(d.dossiers ?? []);

      let firstAccount = "";
      if (sRes?.ok) {
        const s = await sRes.json();
        const opts: AccountOpt[] = (s.accounts ?? []).map((a: { id: string; handle: string }) => ({
          id: a.id,
          handle: a.handle,
        }));
        setAccounts(opts);
        firstAccount = opts[0]?.id ?? "";
        setAccountId((prev) => prev || firstAccount);
      }

      // Ay planı (varsa) — plan yoksa sessiz boş durum.
      const acc = firstAccount || accountId;
      if (acc) {
        const pRes = await fetch(
          `/api/reels/plan?accountId=${encodeURIComponent(acc)}&month=${currentMonth()}`
        ).catch(() => null);
        if (pRes?.ok) {
          const p = await pRes.json();
          if (p.success) {
            setPlanSlots(p.plan?.slots ?? null);
            setStaleCount((p.staleFlags ?? []).length);
          }
        }
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, []);

  const createDossier = async () => {
    if (!accountId || topic.trim().length < 3) {
      setNote("Hesap seç ve en az 3 karakterlik konu yaz.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/reels/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          topic: topic.trim(),
          ...(toolName.trim() && toolUrl.trim()
            ? { toolName: toolName.trim(), toolUrl: toolUrl.trim() }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNote(json.error ?? "Dossier üretilemedi");
      } else {
        setNote(
          `Dossier üretildi — durum: ${READINESS[json.finalReadiness as DossierRow["finalReadiness"]]?.label ?? json.finalReadiness}`
        );
        setTopic("");
        setToolName("");
        setToolUrl("");
      }
      await load();
    } catch {
      setNote("Dossier üretilemedi (ağ hatası)");
    } finally {
      setBusy(false);
    }
  };

  const assemblePlan = async () => {
    if (!accountId) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/reels/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          month: currentMonth(),
          postDays: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29],
          // 150K büyüme stratejisi (2026-07 Insights analizi): Reels sütunları
          // kazanan carousel serilerinin video versiyonlarıdır — A-kademesi
          // (prompt reveal, site turu, araç demo) + B (palet reveal).
          pillars: ["ai_prompt_reveal", "site_turu", "arac_demo", "palet_reveal"],
          series: [
            { seriesKey: "best_ai_prompts", pillar: "ai_prompt_reveal", episodesPerMonth: 3 },
            { seriesKey: "best_ai_tools", pillar: "arac_demo", episodesPerMonth: 2 },
          ],
        }),
      });
      const json = await res.json();
      setNote(
        res.ok && json.success
          ? `Plan kuruldu: ${json.slotCount} slot${(json.warnings ?? []).length ? ` · ${json.warnings.length} uyarı` : ""}`
          : (json.error ?? "Plan kurulamadı")
      );
      await load();
    } catch {
      setNote("Plan kurulamadı (ağ hatası)");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card variant="feature" padded>
        <div aria-busy="true" aria-label="Reels dosyaları yükleniyor">
          <Skeleton width={160} height={12} style={{ marginBottom: "var(--space-4)" }} />
          <Skeleton lines={4} />
        </div>
      </Card>
    );
  }
  if (loadFailed) {
    return (
      <Card variant="feature" padded>
        <ErrorState
          title="Reels dosyaları alınamadı"
          description="Dossier verisi getirilemedi (tablolar db:push bekliyor olabilir)."
          onRetry={load}
        />
      </Card>
    );
  }

  return (
    <>
      <Card variant="feature" padded>
        <SectionHeader
          eyebrow="YENİ DOSSIER"
          title="Reels Dosyası Üret"
          description="Araç adlıysa önce HTTP doğrulaması koşar — kanıtsız araç asla 'doğrulandı' olamaz."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="Hesap"
            style={{
              padding: "9px 12px", background: "var(--bg-base)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              color: "var(--text-primary)", fontSize: "var(--text-sm)", fontFamily: "inherit",
            }}
          >
            {accounts.length === 0 && <option value="">hesap yok</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.handle}
              </option>
            ))}
          </select>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Konu (örn. AI mockup akışı)"
            aria-label="Dossier konusu"
            style={{
              padding: "9px 12px", background: "var(--bg-base)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              color: "var(--text-primary)", fontSize: "var(--text-sm)", fontFamily: "inherit",
            }}
          />
          <input
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            placeholder="Araç adı (opsiyonel)"
            aria-label="Araç adı"
            style={{
              padding: "9px 12px", background: "var(--bg-base)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              color: "var(--text-primary)", fontSize: "var(--text-sm)", fontFamily: "inherit",
            }}
          />
          <input
            value={toolUrl}
            onChange={(e) => setToolUrl(e.target.value)}
            placeholder="Araç URL (opsiyonel)"
            aria-label="Araç URL"
            style={{
              padding: "9px 12px", background: "var(--bg-base)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              color: "var(--text-primary)", fontSize: "var(--text-sm)", fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Button size="sm" intent="generate" onClick={createDossier} loading={busy} iconLeft={<Plus size={14} strokeWidth={2} />}>
            Dossier Üret
          </Button>
          {note && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{note}</span>}
        </div>
      </Card>

      <Card variant="feature" padded style={{ marginTop: "var(--space-4)" }}>
        <SectionHeader eyebrow="DOSSIER LİSTESİ" title="Üretilen Dosyalar" />
        {(dossiers ?? []).length === 0 ? (
          <EmptyState
            icon={<Clapperboard size={22} strokeWidth={1.8} />}
            title="Henüz dossier yok"
            description="Yukarıdan konu (ve istersen araç) vererek ilk Reels dosyanı üret."
            compact
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {(dossiers ?? []).map((d, i) => {
              const r = READINESS[d.finalReadiness] ?? READINESS.not_ready;
              return (
                <div
                  key={d.id}
                  style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)",
                    minHeight: 48, padding: "6px var(--space-1)",
                    borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
                  }}
                >
                  <Badge variant={r.variant} size="xs">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {r.icon} {r.label}
                    </span>
                  </Badge>
                  <Badge variant="muted" size="xs">{d.format}</Badge>
                  {d.pillar && <Badge variant="muted" size="xs">{d.pillar}</Badge>}
                  <span style={{ flex: "1 1 220px", minWidth: 0, color: "var(--text-primary)", fontSize: "var(--text-sm)" }}>
                    {d.title}
                  </span>
                  <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                    ${d.costUsd.toFixed(3)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card variant="feature" padded style={{ marginTop: "var(--space-4)" }}>
        <SectionHeader
          eyebrow="AY PLANI"
          title={`${currentMonth()} Planı`}
          description="Deterministik montaj: %60 evergreen / %25 seasonal / %15 reactive; tekrar histogramı uyarır."
          action={
            <Button size="sm" variant="secondary" onClick={assemblePlan} loading={busy} iconLeft={<CalendarDays size={14} strokeWidth={2} />}>
              Planı Kur / Yenile
            </Button>
          }
        />
        {staleCount > 0 && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--accent-2-text)", marginBottom: "var(--space-3)" }}>
            {staleCount} dossier'in araç kanıtı bayat — yayınlamadan önce yeniden doğrula.
          </div>
        )}
        {!planSlots || planSlots.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} strokeWidth={1.8} />}
            title="Bu ay için plan yok"
            description="Planı Kur ile 10 slotluk varsayılan aylık düzeni oluştur (sonra düzenlenebilir)."
            compact
          />
        ) : (
          <div style={{ borderTop: "1px solid var(--border-faint)" }}>
            {slotsToLanes(planSlots).map((lane) => (
              <TimelineLane
                key={lane.label}
                label={lane.label}
                items={lane.items}
                daysInMonth={daysInMonth(currentMonth())}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
