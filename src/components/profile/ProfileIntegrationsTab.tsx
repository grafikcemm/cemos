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

type Provider = {
  key: string;
  name: string;
  group: "core" | "social" | "optional";
  status: "connected" | "missing" | "blocked" | "optional";
  envNames: string[];
  note?: string;
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

function display(p: Provider, h: Health | null): { variant: "success" | "danger" | "yellow" | "muted"; label: string; live?: string } {
  if (p.status === "blocked") return { variant: "yellow", label: "engelli" };
  const he = healthOf(p.key, h);
  if (p.status === "connected") {
    if (he && typeof he.ok === "boolean") {
      return he.ok
        ? { variant: "success", label: "bağlı", live: he.message }
        : { variant: "yellow", label: "yanıt yok", live: he.message };
    }
    return { variant: "success", label: "yapılandırıldı" };
  }
  if (p.status === "missing") return { variant: "danger", label: "eksik" };
  return { variant: "muted", label: "opsiyonel" };
}

export default function ProfileIntegrationsTab() {
  const toast = useToast();
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [iRes, hRes] = await Promise.all([fetch("/api/integrations"), fetch("/api/health").catch(() => null)]);
      if (!iRes.ok) throw new Error("http");
      const iJson = await iRes.json();
      if (!iJson.success) throw new Error("payload");
      setProviders(iJson.providers ?? []);
      if (hRes?.ok) setHealth(await hRes.json().catch(() => null));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

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
