"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plug } from "lucide-react";
import { PageHeader, Card, Badge, Button, ErrorState, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useXAgentStore } from "@/store/xagent";
import { display, type Provider } from "./integrationDisplay";
import { useSystemHealth } from "@/components/shell/SystemHealthProvider";

/**
 * Profil / Entegrasyonlar (05 §G2) — sağlayıcı yapılandırma durumu. Yalnız env
 * NAME (code), secret VALUE ASLA. X API doğrudan yayın kalıcı BLOCKED-EXTERNAL
 * (ödeme onayı yok — "Onay ver" gerçek ödeme YAPMAZ). Her eksik/engelli için tek
 * kurtarma. Hafif probe (timeout yok → panel "bilinmiyor"a düşmez); canlı derin
 * durum Sistem'de. Profil host'u kendi başlığını taşır.
 */

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

const GROUP_LABEL: Record<Provider["group"], string> = {
  core: "Çekirdek",
  social: "Sosyal",
  optional: "Opsiyonel",
};

const X_COST = "5–8 post/gün senaryosu: %0 link ~$2–4/ay · %50 link ~$16–26/ay · %100 link ~$30–48/ay.";

export default function ProfileIntegrationsTab() {
  const toast = useToast();
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [composio, setComposio] = useState<ComposioInfo | null>(null);
  // WP-02: kendi /api/health fetch'i kaldırıldı — provider'ın tek okuması tüketilir.
  const { health } = useSystemHealth();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncOutcome | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const iRes = await fetch("/api/integrations");
      if (!iRes.ok) throw new Error("http");
      const iJson = await iRes.json();
      if (!iJson.success) throw new Error("payload");
      setProviders(iJson.providers ?? []);
      setComposio(iJson.composio ?? null);
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
