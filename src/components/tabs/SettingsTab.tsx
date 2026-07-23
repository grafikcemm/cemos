"use client";

import { useState, useEffect } from "react";
import {
  Rocket,
  Square,
  RefreshCw,
  AlertTriangle,
  Plug,
  Database,
  Cpu,
  Wallet,
  CalendarClock,
  CheckCircle2,
  Activity,
  Server,
  Zap,
  Gauge,
  BarChart3,
} from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { useSystemHealth } from "@/components/shell/SystemHealthProvider";
import LearningStatusCard from "@/components/LearningStatusCard";
import { PageHeader, Card, SectionHeader, EmptyState, Button, Toggle, Select, Badge } from "@/components/ui";
import MemoryProposalsSection from "@/components/settings/MemoryProposalsSection";
import SeriesDnaSection from "@/components/settings/SeriesDnaSection";

const SCHEDULE_OPTIONS: { value: "daily" | "monday"; label: string }[] = [
  { value: "daily", label: "Her gün" },
  { value: "monday", label: "Sadece Pazartesi" },
];

type DbSchedule = {
  automationEnabled: boolean;
  dailyMaxPosts: number;
  quietStartHour: number;
  quietEndHour: number;
  requireApproval: boolean;
  scanCron: string;
  cadence: string;
};

type DbAccount = {
  id: string;
  handle: string;
  concept: string;
  schedule: DbSchedule | null;
};

type CostStats = {
  today: { scan: number; generate: number; publish: number; totalUsd: number };
  month: { scan: number; generate: number; publish: number; totalUsd: number; budgetUsd: number };
  dailySeries: Array<{ date: string; totalUsd: number; scanUsd: number; generateUsd: number }>;
};

export default function SettingsTab() {
  const [accounts, setAccounts] = useState<DbAccount[]>([]);
  // WP-02: kendi /api/health fetch'i kaldırıldı — provider'ın tek okuması tüketilir.
  // Review MEDIUM-2: mount/mutation/"Yenile" health kartlarını da tazelemeli →
  // provider refresh'i loadData ile birlikte çağrılır (guard'ı bypass eder).
  const { health, refresh: refreshHealth } = useSystemHealth();
  const [costs, setCosts] = useState<CostStats | null>(null);
  const [models, setModels] = useState<{ role: string; label: string; activeModel: string }[]>([]);
  const [modelProfile, setModelProfile] = useState("dev");
  const [freeOverridesIgnored, setFreeOverridesIgnored] = useState(false);
  const [lastUsedMetadata, setLastUsedMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    // Health kartları context'ten gelir; bu ekranın her yüklemesi/mutasyonu/
    // "Yenile"si provider okumasını da tazeler (tek noktadan, guard-bypass).
    refreshHealth();
    try {
      // Per-promise catch: a slow costs call must not blank the whole
      // settings page — each card degrades independently.
      const [settingsRes, costsRes] = await Promise.all([
        fetchJson<any>("/api/settings"),
        fetchJson<any>("/api/costs").catch(() => null),
      ]);
      if (settingsRes.accounts) setAccounts(settingsRes.accounts);
      if (settingsRes.models) setModels(settingsRes.models);
      if (settingsRes.modelProfile) setModelProfile(settingsRes.modelProfile);
      if (settingsRes.freeOverridesIgnored !== undefined) setFreeOverridesIgnored(settingsRes.freeOverridesIgnored);
      if (settingsRes.lastUsedMetadata !== undefined) setLastUsedMetadata(settingsRes.lastUsedMetadata);
      if (costsRes) setCosts(costsRes);
    } catch {
      // silent — errors shown via health card states
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {

    loadData();
  }, []);

  const updateSchedule = async (accountId: string, updates: Partial<DbSchedule>) => {
    try {
      const data = await fetchJson<{ success: boolean; schedule?: DbSchedule }>(
        "/api/settings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, ...updates }),
        }
      );
      if (data.success && data.schedule) {
        const schedule = data.schedule;
        setAccounts((prev) =>
          prev.map((acc) =>
            acc.id === accountId ? { ...acc, schedule: { ...acc.schedule, ...schedule } } : acc
          )
        );
      } else {
        // Honesty: a failed save must not look applied. Reload the persisted
        // (unchanged) state and tell the operator instead of failing silently.
        await loadData();
        alert("Ayar kaydedilemedi. Değişiklik uygulanmadı.");
      }
    } catch {
      await loadData();
      alert("Ayar kaydedilemedi (bağlantı hatası). Değişiklik uygulanmadı.");
    }
  };

  const toggleOperatorMode = async (action: "start" | "stop") => {
    try {
      const data = await fetchJson<{ success: boolean; error?: string }>(
        "/api/settings/operator-mode",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (data.success) {
        await loadData();
        alert(`Operator Mode ${action === "start" ? "başlatıldı" : "durduruldu"}.`);
      } else {
        alert("Hata: " + data.error);
      }
    } catch (err) {
      alert("Hata: " + (err instanceof Error ? err.message : "Bir hata oluştu."));
    }
  };

  const handleActivateOperatorQuality = async () => {
    try {
      const data = await fetchJson<{ success: boolean; error?: string }>(
        "/api/settings/model-profile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: "operator_quality" }),
        }
      );
      if (data.success) {
        await loadData();
        alert("Model profili 'Operator Quality' olarak kalıcı kaydedildi (sunucu-otoriteli). Her AI çağrısı öncesi yüklenir; soğuk başlangıç dahil tüm sunucu örneklerinde rol-bazlı üretim yönlendirmesine uygulanır. (Not: sabit preset'li yollar — ana yazar/jüri — kendi modelini kullanır, profilden bağımsız.)");
      } else {
        alert("Hata: " + data.error);
      }
    } catch (err) {
      alert("Hata: " + (err instanceof Error ? err.message : "Bir hata oluştu."));
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 760 }}>
        <PageHeader
          size="compact"
          eyebrow="SISTEM"
          title="Ayarlar & Sağlık"
          subtitle="Bağlantılar, model profili, bütçe ve hesap otomasyonu — tek panel."
        />
        <Card variant="feature" padded>
          <EmptyState
            icon={<Gauge size={22} strokeWidth={1.8} />}
            title="Ayarlar yükleniyor"
            description="Bağlantı durumu, maliyet ve hesap planlamaları getiriliyor."
            compact
          />
        </Card>
      </div>
    );
  }

  const monthlyBudgetUSD = costs?.month?.budgetUsd ?? 10;
  const monthlyCost = costs?.month?.totalUsd ?? 0;
  const budgetPct = Math.min(100, Math.round((monthlyCost / monthlyBudgetUSD) * 100));

  const workerOk = health?.worker?.inferredStatus === "recent_tick";
  const workerStale = health?.worker?.inferredStatus === "stale";

  const healthCards = [
    {
      key: "openrouter",
      label: "OpenRouter (LLM)",
      icon: <Plug size={15} strokeWidth={1.8} />,
      ok: health?.openrouter?.ok ?? false,
      detail: health?.openrouter?.message || (health?.openrouter?.configured ? "API key aktif" : "API key eksik"),
    },
    {
      key: "socialdata",
      label: "SocialData (X)",
      icon: <Activity size={15} strokeWidth={1.8} />,
      ok: health?.socialdata?.ok ?? false,
      detail: health?.socialdata?.message || (health?.socialdata?.configured ? "API key aktif" : "API key eksik"),
    },
    {
      key: "database",
      label: "Database (Neon)",
      icon: <Database size={15} strokeWidth={1.8} />,
      ok: health?.database?.ok ?? false,
      detail: health?.database?.message || "Bağlı",
    },
    {
      key: "worker",
      label: "Worker",
      icon: <Server size={15} strokeWidth={1.8} />,
      ok: workerOk,
      stale: workerStale,
      detail: workerOk
        ? `Son tick: ${health?.worker?.lastTickAt ? new Date(health.worker.lastTickAt).toLocaleTimeString("tr-TR") : "—"}`
        : workerStale
        ? `Eski tick: ${health?.worker?.lastTickAt ? new Date(health.worker.lastTickAt).toLocaleTimeString("tr-TR") : "—"}`
        : "Günlük cron ile çalışır",
    },
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        size="compact"
        eyebrow="SISTEM"
        title="Ayarlar & Sağlık"
        subtitle="Bağlantılar, model profili, bütçe ve hesap otomasyonu — tek panel."
        actions={
          <>
            <Button variant="primary" size="sm" onClick={() => toggleOperatorMode("start")} iconLeft={<Rocket size={15} strokeWidth={2} />}>
              Operator Modu
            </Button>
            <Button variant="danger" size="sm" onClick={() => toggleOperatorMode("stop")} iconLeft={<Square size={14} strokeWidth={2} />}>
              Durdur
            </Button>
            <Button variant="secondary" size="sm" onClick={loadData} iconLeft={<RefreshCw size={14} strokeWidth={2} />}>
              Yenile
            </Button>
          </>
        }
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: workerOk ? "var(--green)" : workerStale ? "var(--accent-2-text)" : "var(--danger)",
                  boxShadow: `0 0 0 3px color-mix(in srgb, ${workerOk ? "var(--green)" : workerStale ? "var(--accent-2-text)" : "var(--danger)"} 22%, transparent)`,
                }}
              />
              <span style={{ color: "var(--text-muted)" }}>Worker</span>
              <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {workerOk ? "Aktif" : workerStale ? "Eski tick" : "Pasif"}
              </strong>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Wallet size={14} strokeWidth={2} style={{ color: "var(--accent-text)" }} />
              <span style={{ color: "var(--text-muted)" }}>Bu ay</span>
              <strong className="tnum" style={{ color: budgetPct > 80 ? "var(--danger)" : "var(--text-primary)", fontWeight: 500 }}>
                ${monthlyCost.toFixed(2)}
              </strong>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Cpu size={14} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
              <span style={{ color: "var(--text-muted)" }}>Profil</span>
              <Badge variant={modelProfile === "dev" ? "yellow" : "accent"} size="sm">
                {modelProfile === "premium" ? "Premium" : modelProfile === "operator_quality" ? "Operator Quality" : "Dev / Test"}
              </Badge>
            </span>
          </>
        }
      />

      {/* Continuous-learning telemetry (cron results, mined patterns, engagement) */}
      <LearningStatusCard />

      {/* Worker down banner */}
      {!workerOk && (
        <Card variant="quiet" padded={false} style={{ marginBottom: "var(--space-4)", border: "1px solid var(--accent-2-border)", background: "var(--gradient-accent-2), var(--bg-surface)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)" }}>
            <AlertTriangle size={18} strokeWidth={2} style={{ color: "var(--accent-2-text)", flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--accent-2-text)", fontWeight: 500 }}>Worker pasif.</strong>{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                Zamanlanmış paylaşımlar için{" "}
                <code style={{ background: "var(--bg-base)", color: "var(--accent-2-text)", padding: "1px 6px", borderRadius: "var(--radius-sm)", fontFamily: "monospace", border: "1px solid var(--accent-2-border)" }}>npm run worker</code>{" "}
                ayrı bir terminalde çalışmalı.
              </span>
            </div>
          </div>
        </Card>
      )}

      {/*
        Tek yüzey — kompakt form arketipi: her ayar grubu kart-içinde-kart yerine
        düz bir bölüm; bölümler --border-faint ayraçla ayrılır.
      */}
      <Card variant="feature" padded={false} style={{ padding: "0 var(--space-5)", marginBottom: "var(--space-5)" }}>
        {/* Health status rows */}
        <Section eyebrow="DURUM" title="Bağlantı & Sağlık" first>
          <div>
            {healthCards.map((card, i) => {
              const cardOk = card.ok;
              const cardWarn = card.stale;
              const toneColor = !cardOk ? "var(--danger)" : cardWarn ? "var(--accent-2-text)" : "var(--green)";
              return (
                <div
                  key={card.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-2) 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
                  }}
                >
                  <span style={{ color: toneColor, display: "inline-flex", flexShrink: 0 }}>{card.icon}</span>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", flexShrink: 0 }}>{card.label}</span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.45, marginLeft: "auto", textAlign: "right", minWidth: 0 }}>
                    {card.detail}
                  </span>
                  <span
                    style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      background: toneColor,
                      boxShadow: `0 0 0 3px color-mix(in srgb, ${toneColor} 22%, transparent)`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </Section>

        {/* Budget */}
        <Section eyebrow="MALIYET" title="Bütçe Kullanımı">
          {(() => {
            const budgetTone = budgetPct > 80 ? "var(--danger)" : budgetPct > 60 ? "var(--accent-2-text)" : "var(--green)";
            const barFill = budgetPct > 80 ? "var(--danger)" : budgetPct > 60 ? "var(--accent-2)" : "var(--accent)";
            return (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span className="font-display tnum" style={{ fontSize: "var(--text-2xl)", fontWeight: 500, color: budgetTone, letterSpacing: "-0.02em", lineHeight: 1 }}>
                      ${monthlyCost.toFixed(2)}
                    </span>
                    <span className="tnum" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>/ ${monthlyBudgetUSD}</span>
                  </div>
                  <span className="font-display tnum" style={{ fontSize: "var(--text-lg)", fontWeight: 500, color: budgetTone, letterSpacing: "-0.01em" }}>{budgetPct}%</span>
                </div>
                <div style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", height: 8, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "var(--radius-sm)", width: `${budgetPct}%`,
                    background: barFill,
                    transition: "width 0.3s var(--ease-out)",
                  }} />
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "var(--space-3)" }}>
                  <Gauge size={13} strokeWidth={1.8} />
                  Bütçe dolduğunda taramalar ve üretimler otomatik duraklatılır.
                </div>
              </>
            );
          })()}
        </Section>

        {/* Model preferences */}
        {models.length > 0 && (
          <Section eyebrow="MODEL" title="Model Tercihleri">
            <SettingRow
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <Cpu size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
                  Aktif Model Profili
                </span>
              }
            >
              <Badge variant={modelProfile === "dev" ? "yellow" : modelProfile === "operator_quality" ? "blue" : "accent"} size="sm">
                {modelProfile === "premium" ? "Premium" : modelProfile === "operator_quality" ? "Operator Quality" : "Dev / Ucuz Test"}
              </Badge>
            </SettingRow>

            {modelProfile === "dev" && (
              <div style={{
                margin: "var(--space-3) 0", padding: "var(--space-3) var(--space-4)",
                background: "var(--gradient-accent-2), var(--bg-elevated)", border: "1px solid var(--accent-2-border)",
                borderRadius: "var(--radius-md)", fontSize: "var(--text-xs)", lineHeight: 1.5
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 500, color: "var(--accent-2-text)", marginBottom: "var(--space-2)" }}>
                  <AlertTriangle size={16} strokeWidth={2} />
                  Düşük Kalite Modu Aktif (Dev / Free)
                </div>
                <div style={{ color: "var(--text-secondary)", marginBottom: "var(--space-3)", lineHeight: 1.55 }}>
                  Şu an ücretsiz modeller devrede veya model profili 'dev' olarak yapılandırılmış. Bu modda üretilen içerikler yeterince kaliteli olmayabilir ve X kurallarına takılabilir. Günlük operasyon için paid ve stabil modelleri kullanan <strong style={{ color: "var(--text-primary)" }}>Operator Quality</strong> profilini aktifleştirin.
                </div>
                <Button variant="primary" size="sm" onClick={handleActivateOperatorQuality} iconLeft={<Zap size={14} strokeWidth={2} />}>
                  Operator Quality Profiline Geç (env.local Güncelle)
                </Button>
              </div>
            )}

            {freeOverridesIgnored && (
              <div style={{
                margin: "var(--space-3) 0", padding: "var(--space-3) var(--space-4)",
                background: "var(--gradient-accent-2), var(--bg-elevated)", border: "1px solid var(--accent-2-border)",
                borderRadius: "var(--radius-md)", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5,
                display: "flex", alignItems: "flex-start", gap: 7,
              }}>
                <AlertTriangle size={15} strokeWidth={2} style={{ color: "var(--accent-2-text)", flexShrink: 0, marginTop: 1 }} />
                <span><strong style={{ color: "var(--accent-2-text)" }}>Kalite Koruması Aktif:</strong> <code style={{ background: "var(--bg-base)", color: "var(--accent-2-text)", padding: "1px 5px", borderRadius: "var(--radius-sm)", fontFamily: "monospace" }}>.env.local</code> içerisindeki free model override&apos;ları ({modelProfile === "premium" ? "Premium" : "Operator Quality"} kalitesini korumak için) devre dışı bırakıldı ve paid model fallbacks etkinleştirildi.</span>
              </div>
            )}

            {models.map((m) => (
              <SettingRow key={m.role} label={m.label}>
                <code style={{ fontSize: "var(--text-xs)", color: "var(--accent-text)", fontFamily: "monospace", background: "var(--bg-base)", padding: "2px 7px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>{m.activeModel}</code>
              </SettingRow>
            ))}

            {lastUsedMetadata && (
              <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border-faint)", fontSize: "var(--text-xs)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 500, color: "var(--text-secondary)", marginBottom: "var(--space-3)" }}>
                  <BarChart3 size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
                  En Son Gerçek Üretim Bilgisi · @{lastUsedMetadata.account}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", color: "var(--text-muted)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Yazar (Writer) Modeli</span>
                    <code style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{lastUsedMetadata.writer}</code>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Hakem (Judge) Modeli</span>
                    <code style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{lastUsedMetadata.judge}</code>
                  </div>
                  {lastUsedMetadata.finalEditor && lastUsedMetadata.finalEditor !== "unknown" && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Final Editör Modeli</span>
                      <code style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{lastUsedMetadata.finalEditor}</code>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Fallback Kullanıldı mı?</span>
                    {lastUsedMetadata.fallbackUsed ? (
                      <Badge variant="yellow" size="sm">Evet</Badge>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500, color: "var(--green)" }}>
                        <CheckCircle2 size={13} strokeWidth={2} /> Primary kullanıldı
                      </span>
                    )}
                  </div>
                  {lastUsedMetadata.fallbackUsed && lastUsedMetadata.fallbackReason && (
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--accent-2-text)", marginTop: 2, background: "var(--gradient-accent-2), var(--bg-elevated)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent-2-border)" }}>
                      Nedeni: {lastUsedMetadata.fallbackReason}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Account schedules */}
        <Section eyebrow="OTOMASYON" title="Hesap Planlamaları">
          {accounts.length === 0 ? (
            <EmptyState
              icon={<CalendarClock size={22} strokeWidth={1.8} />}
              title="Hesap bulunamadı"
              description="Henüz planlama yapılabilecek bir hesap yok."
              compact
            />
          ) : (
            <div>
              {accounts.map((acc, accIdx) => {
                const sched = acc.schedule || ({} as Partial<DbSchedule>);
                const automationOn = sched.automationEnabled ?? false;
                return (
                  <div
                    key={acc.id}
                    style={{
                      paddingTop: accIdx === 0 ? 0 : "var(--space-4)",
                      marginTop: accIdx === 0 ? 0 : "var(--space-4)",
                      borderTop: accIdx === 0 ? "none" : "1px solid var(--border-faint)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)", paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--border-faint)" }}>
                      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 7 }}>
                        <strong className="font-display" style={{ fontSize: "var(--text-md)", fontWeight: 500, color: automationOn ? "var(--accent-text)" : "var(--text-primary)", letterSpacing: "-0.01em" }}>
                          @{acc.handle}
                        </strong>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{acc.concept}</span>
                      </span>
                      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer", color: automationOn ? "var(--accent-text)" : "var(--text-secondary)", fontWeight: 500 }}>
                        Otomasyon
                        <Toggle
                          checked={automationOn}
                          onChange={(v) => updateSchedule(acc.id, { automationEnabled: v })}
                          size="sm"
                        />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "var(--space-3)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                        <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Tarama Sıklığı</span>
                        <Select
                          value={sched.cadence ?? "daily"}
                          onChange={(e) => updateSchedule(acc.id, { cadence: e.target.value })}
                          options={SCHEDULE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                        <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Günlük Maks. Paylaşım</span>
                        <Select
                          value={String(sched.dailyMaxPosts ?? 3)}
                          onChange={(e) => updateSchedule(acc.id, { dailyMaxPosts: Number(e.target.value) })}
                          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                        <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Sessiz Saatler Başlangıç</span>
                        <Select
                          value={String(sched.quietStartHour ?? 23)}
                          onChange={(e) => updateSchedule(acc.id, { quietStartHour: Number(e.target.value) })}
                          options={Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, "0")}:00` }))}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                        <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Sessiz Saatler Bitiş</span>
                        <Select
                          value={String(sched.quietEndHour ?? 8)}
                          onChange={(e) => updateSchedule(acc.id, { quietEndHour: Number(e.target.value) })}
                          options={Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, "0")}:00` }))}
                        />
                      </div>
                      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "var(--space-1)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border-faint)" }}>
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Paylaşım öncesi onay gereksin</span>
                        <Toggle
                          checked={sched.requireApproval ?? true}
                          onChange={(v) => updateSchedule(acc.id, { requireApproval: v })}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </Card>

      {/* Hafıza onay kuyruğu (Sprint 3 — C9: Settings içinde, yeni ekran yok) */}
      <MemoryProposalsSection />

      {/* Seri DNA editörü (Sprint 8 — C9: Settings alt-bölümü) */}
      <SeriesDnaSection />
    </div>
  );
}

/** Düz bölüm — kart-içinde-kart yerine SectionHeader + içerik; ayraç: --border-faint. */
function Section({ eyebrow, title, children, first = false }: { eyebrow?: string; title: string; children: React.ReactNode; first?: boolean }) {
  return (
    <section style={{ padding: "var(--space-5) 0", borderTop: first ? "none" : "1px solid var(--border-faint)" }}>
      <SectionHeader eyebrow={eyebrow} title={title} />
      {children}
    </section>
  );
}

function SettingRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)",
      padding: "var(--space-2) 0", borderBottom: "1px solid var(--border-faint)",
    }}>
      <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </div>
  );
}
