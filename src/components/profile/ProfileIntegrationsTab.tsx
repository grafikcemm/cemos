"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plug } from "lucide-react";
import { PageHeader, Card, Badge, Button, ErrorState, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useXAgentStore } from "@/store/xagent";

/**
 * Profil / Entegrasyonlar (05 §G2) — sağlayıcı yapılandırma durumu. Yalnız env
 * NAME (code), secret VALUE ASLA. X API doğrudan yayın kalıcı BLOCKED-EXTERNAL
 * (ödeme onayı yok — "Onay ver" gerçek ödeme YAPMAZ). Her eksik/engelli için tek
 * kurtarma. Hafif probe (timeout yok → panel "bilinmiyor"a düşmez); canlı derin
 * durum Sistem'de. Profil host'u kendi başlığını taşır.
 */

type Liveness = {
  state: "verified" | "degraded" | "unknown";
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorClass: string | null;
};

type Provider = {
  key: string;
  name: string;
  group: "core" | "social" | "optional";
  status: "connected" | "missing" | "blocked" | "optional";
  envNames: string[];
  note?: string;
  liveness?: Liveness;
};

type ComposioBinding = {
  connectionStatus: string;
  externalHandle: string;
  lastVerifiedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastErrorClass: string;
  lastSyncSummary: {
    provider?: string;
    fallbackUsed?: boolean;
    fallbackReason?: string | null;
    mediaFetched?: number;
    mediaUpserted?: number;
    commentsUpserted?: number;
    insightCaptured?: boolean;
    contentBridged?: number;
  } | null;
};

type ComposioInfo = {
  configured: boolean;
  missingEnvNames: string[];
  provider: "auto" | "composio" | "meta";
  accountHandle: string;
  toolkitVersion: string;
  readOnly: true;
  binding: ComposioBinding | null;
};

type SyncOutcome = {
  ok: boolean;
  provider: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  mediaFetched: number;
  mediaUpserted: number;
  commentsUpserted: number;
  insightCaptured: boolean;
  contentBridged: number;
  error?: string;
  errorClass?: string;
  warnings: string[];
};

type HealthEntry = { configured?: boolean; ok?: boolean; message?: string };
type Health = {
  openrouter?: HealthEntry;
  socialdata?: HealthEntry;
  database?: HealthEntry;
  metaToken?: HealthEntry;
};

const GROUP_LABEL: Record<Provider["group"], string> = {
  core: "Çekirdek",
  social: "Sosyal",
  optional: "Opsiyonel",
};

const X_COST = "5–8 post/gün senaryosu: %0 link ~$2–4/ay · %50 link ~$16–26/ay · %100 link ~$30–48/ay.";

function healthOf(key: string, h: Health | null): HealthEntry | undefined {
  if (!h) return undefined;
  if (key === "openrouter") return h.openrouter;
  if (key === "socialdata") return h.socialdata;
  if (key === "neon") return h.database;
  if (key === "meta") return h.metaToken;
  return undefined;
}

function livenessNote(l: Liveness | undefined): string | undefined {
  if (!l) return undefined;
  if (l.state === "degraded") {
    const when = l.lastFailureAt ? new Date(l.lastFailureAt).toLocaleString("tr-TR") : "";
    return `Son çağrı başarısız${l.lastErrorClass ? ` (${l.lastErrorClass})` : ""}${when ? ` · ${when}` : ""}`;
  }
  if (l.state === "verified" && l.lastSuccessAt) {
    return `Son başarılı çağrı: ${new Date(l.lastSuccessAt).toLocaleString("tr-TR")}`;
  }
  return undefined;
}

function display(p: Provider, h: Health | null): { variant: "success" | "danger" | "yellow" | "muted"; label: string; live?: string } {
  if (p.status === "blocked") return { variant: "yellow", label: "engelli" };
  const he = healthOf(p.key, h);
  const lNote = livenessNote(p.liveness);
  if (p.status === "connected") {
    // The live /api/health probe is authoritative for CURRENT state when present.
    if (he && typeof he.ok === "boolean") {
      return he.ok
        ? { variant: "success", label: "bağlı", live: he.message ?? lNote }
        : { variant: "yellow", label: "yanıt yok", live: he.message ?? lNote };
    }
    // No live probe → fall back to the persisted ledger (§13/BUG-05): a configured
    // provider whose LAST recorded call failed is NOT reported as healthy.
    if (p.liveness?.state === "degraded") {
      return { variant: "yellow", label: "son çağrı başarısız", live: lNote };
    }
    if (p.liveness?.state === "verified") {
      return { variant: "success", label: "bağlı", live: lNote };
    }
    // Configured but never exercised — honestly "configured, not verified".
    return { variant: "muted", label: "yapılandırıldı · doğrulanmadı" };
  }
  if (p.status === "missing") return { variant: "danger", label: "eksik" };
  return { variant: "muted", label: "opsiyonel" };
}

export default function ProfileIntegrationsTab() {
  const toast = useToast();
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [composio, setComposio] = useState<ComposioInfo | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncOutcome | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [iRes, hRes] = await Promise.all([fetch("/api/integrations"), fetch("/api/health").catch(() => null)]);
      if (!iRes.ok) throw new Error("http");
      const iJson = await iRes.json();
      if (!iJson.success) throw new Error("payload");
      setProviders(iJson.providers ?? []);
      setComposio(iJson.composio ?? null);
      if (hRes?.ok) setHealth(await hRes.json().catch(() => null));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const runInstagramSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/instagram/sync", { method: "POST" });
      const json = await res.json().catch(() => null);
      const r = json?.result as SyncOutcome | undefined;
      if (!res.ok || !json?.success || !r) {
        setSyncResult({
          ok: false,
          provider: "none",
          fallbackUsed: false,
          mediaFetched: 0,
          mediaUpserted: 0,
          commentsUpserted: 0,
          insightCaptured: false,
          contentBridged: 0,
          warnings: [],
          error: json?.error ?? "Sync isteği başarısız",
        });
      } else {
        setSyncResult(r);
      }
      await load();
    } catch (e) {
      setSyncResult({
        ok: false,
        provider: "none",
        fallbackUsed: false,
        mediaFetched: 0,
        mediaUpserted: 0,
        commentsUpserted: 0,
        insightCaptured: false,
        contentBridged: 0,
        warnings: [],
        error: e instanceof Error ? e.message : "Sync isteği başarısız",
      });
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const recovery = (p: Provider) => {
    if (p.key === "xapi") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              toast.info("Bu onay gerçek ödeme YAPMAZ. Doğrudan yayın Faz 1E'de ödeme onayıyla açılır; şu an intent-only (X'te aç).")
            }
          >
            Onay ver
          </Button>
          <button
            onClick={() => setActiveTab("costs")}
            style={{ background: "none", border: "none", color: "var(--accent-text)", fontFamily: "inherit", fontSize: "var(--text-xs)", cursor: "pointer", padding: 0 }}
          >
            Maliyet senaryosu ›
          </button>
        </div>
      );
    }
    if (p.key === "meta" && p.status === "missing") {
      return (
        <Button size="sm" variant="secondary" onClick={() => toast.info("Meta izni tamamlanmalı: instagram_basic + business_discovery. Env: META_ACCESS_TOKEN.")}>
          İzni tamamla
        </Button>
      );
    }
    if (p.status === "missing") {
      return (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          Kurulum: {p.envNames.map((n) => n).join(" / ")} ayarla.
        </span>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div style={{ width: "100%" }}>
        <PageHeader eyebrow="Profil" title="Entegrasyonlar" subtitle="Kimlik bilgileri, izinler ve dış bağlantı durumu." />
        <Card padded><Skeleton lines={6} /></Card>
      </div>
    );
  }
  if (failed) {
    return (
      <div style={{ width: "100%" }}>
        <PageHeader eyebrow="Profil" title="Entegrasyonlar" />
        <ErrorState title="Durum alınamadı" description="Entegrasyon durumu getirilemedi. Yeniden dene." onRetry={load} />
      </div>
    );
  }

  const groups: Provider["group"][] = ["core", "social", "optional"];

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        eyebrow="Profil"
        title="Entegrasyonlar"
        subtitle="Sağlayıcı yapılandırma durumu — yalnız env adları gösterilir, gizli değerler asla."
        actions={
          <Button variant="secondary" size="sm" onClick={load} iconLeft={<RefreshCw size={14} strokeWidth={2} />}>
            Yenile
          </Button>
        }
      />

      {composio && (
        <section data-testid="composio-card" style={{ marginBottom: "var(--stack)" }}>
          <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>
            Composio · Instagram köprüsü
          </div>
          <Card padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {(() => {
                  const st = !composio.configured
                    ? { label: "yapılandırma gerekli", variant: "muted" as const }
                    : composio.binding?.connectionStatus === "connected"
                      ? { label: "bağlı", variant: "success" as const }
                      : composio.binding?.connectionStatus === "blocked"
                        ? { label: "engelli", variant: "danger" as const }
                        : composio.binding?.connectionStatus === "degraded"
                          ? { label: "sorunlu", variant: "yellow" as const }
                          : { label: "yapılandırıldı · doğrulanmadı", variant: "yellow" as const };
                  return (
                    <span data-testid="composio-status">
                      <Badge variant={st.variant} size="sm">{st.label}</Badge>
                    </span>
                  );
                })()}
                <span data-testid="composio-readonly">
                  <Badge variant="muted" size="sm">salt-okuma</Badge>
                </span>
                {composio.binding?.lastSyncSummary?.fallbackUsed && (
                  <span data-testid="composio-fallback-warning">
                    <Badge variant="yellow" size="sm">
                      fallback: Meta ({composio.binding.lastSyncSummary.fallbackReason ?? "composio kullanılamadı"})
                    </Badge>
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Bağlı IG hesabı:{" "}
                <strong data-testid="composio-external-handle">
                  {composio.binding?.externalHandle ? `@${composio.binding.externalHandle}` : "henüz doğrulanmadı"}
                </strong>
                {" · "}CemOS hesabı:{" "}
                <strong data-testid="composio-bound-account">
                  {composio.accountHandle ? `@${composio.accountHandle}` : "binding yok"}
                </strong>
                {" · "}Sağlayıcı modu: <strong>{composio.provider}</strong>
                {composio.toolkitVersion ? <>{" · "}Toolkit: <strong>{composio.toolkitVersion}</strong></> : null}
              </p>
              <p style={{ margin: 0, fontSize: "var(--text-2xs)", color: "var(--text-muted)" }} data-testid="composio-last-sync">
                Son başarılı sync:{" "}
                {composio.binding?.lastSuccessfulSyncAt
                  ? new Date(composio.binding.lastSuccessfulSyncAt).toLocaleString("tr-TR")
                  : "henüz yok"}
                {composio.binding?.lastSyncSummary
                  ? ` · medya ${composio.binding.lastSyncSummary.mediaUpserted ?? 0} · yorum ${composio.binding.lastSyncSummary.commentsUpserted ?? 0} · insight ${composio.binding.lastSyncSummary.insightCaptured ? "✓" : "—"} · içerik köprüsü ${composio.binding.lastSyncSummary.contentBridged ?? 0}`
                  : ""}
              </p>
              {!composio.configured && (
                <p
                  data-testid="composio-missing-env"
                  style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--status-warn-text)", lineHeight: 1.6 }}
                >
                  Bağlantı için eksik env: {composio.missingEnvNames.map((n) => n).join(" · ")}. Instagram hesabın
                  Composio'da zaten bağlı — yalnız server env değerlerinin (gizli değerler buraya yazılmaz)
                  tanımlanması gerekiyor. Yeni OAuth akışı GEREKMEZ.
                </p>
              )}
              {composio.binding?.lastErrorClass && composio.binding.connectionStatus !== "connected" && (
                <p style={{ margin: 0, fontSize: "var(--text-2xs)", color: "var(--status-warn-text)" }}>
                  Son hata sınıfı: {composio.binding.lastErrorClass}
                </p>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="composio-sync"
                  disabled={syncing}
                  onClick={runInstagramSync}
                  iconLeft={<RefreshCw size={14} strokeWidth={2} className={syncing ? "animate-spin" : undefined} />}
                >
                  {syncing ? "Senkronize ediliyor…" : "Instagram verilerini senkronize et"}
                </Button>
                <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                  Yalnız okuma: profil + medya + insight + yorum. Yayınlama/DM yok.
                </span>
              </div>
              {syncResult && (
                <p
                  data-testid="composio-sync-result"
                  style={{
                    margin: 0,
                    fontSize: "var(--text-xs)",
                    lineHeight: 1.6,
                    color: syncResult.ok ? "var(--status-ok-text, var(--text-secondary))" : "var(--status-warn-text)",
                  }}
                >
                  {syncResult.ok
                    ? `Sync tamam (${syncResult.provider}${syncResult.fallbackUsed ? " · fallback" : ""}): medya ${syncResult.mediaUpserted}/${syncResult.mediaFetched}, yorum ${syncResult.commentsUpserted}, insight ${syncResult.insightCaptured ? "✓" : "bugün zaten alınmış"}, içerik köprüsü ${syncResult.contentBridged}.`
                    : `Sync başarısız${syncResult.errorClass ? ` (${syncResult.errorClass})` : ""}: ${syncResult.error ?? "bilinmeyen hata"}`}
                  {syncResult.warnings.length > 0 && ` · ${syncResult.warnings.length} uyarı`}
                </p>
              )}
            </div>
          </Card>
        </section>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
        {groups.map((g) => {
          const rows = (providers ?? []).filter((p) => p.group === g);
          if (rows.length === 0) return null;
          return (
            <section key={g}>
              <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>{GROUP_LABEL[g]}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rows.map((p) => {
                  const d = display(p, health);
                  return (
                    <div
                      key={p.key}
                      data-testid={`integration-row-${p.key}`}
                      style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}
                    >
                      <div
                        aria-hidden
                        style={{ display: "grid", placeItems: "center", width: 36, height: 36, flexShrink: 0, borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--border-faint)", color: "var(--text-muted)" }}
                      >
                        <Plug size={16} strokeWidth={2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</span>
                          <Badge variant={d.variant === "success" ? "success" : d.variant === "danger" ? "danger" : d.variant === "yellow" ? "yellow" : "muted"} size="sm">
                            {d.label}
                          </Badge>
                          {p.envNames.map((n) => (
                            <code
                              key={n}
                              style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", color: "var(--text-secondary)", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-sm)", padding: "1px 6px" }}
                            >
                              {n}
                            </code>
                          ))}
                        </div>
                        {p.note && <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.55 }}>{p.note}</p>}
                        {p.key === "xapi" && <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--status-warn-text)", lineHeight: 1.55 }}>{X_COST}</p>}
                        {d.live && <p style={{ margin: 0, fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{d.live}</p>}
                        {recovery(p)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
