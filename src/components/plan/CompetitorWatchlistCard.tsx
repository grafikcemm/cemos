"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Plus } from "lucide-react";
import {
  Card, Input, Button, Badge, EmptyState, ErrorState, Skeleton, BlockedExternalState, SectionHeader,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

type WatchAccount = {
  id: string;
  username: string;
  isCompetitor: boolean;
  isInspiration: boolean;
  probeStatus: string; // pending | ok | unavailable
  probeError?: string;
  lastSyncAt: string | null;
};

type WatchlistResponse = {
  success: boolean;
  accounts?: WatchAccount[];
  max?: number;
  configured?: boolean;
  error?: string;
};

const PROBE: Record<string, { label: string; tone: "success" | "yellow" | "muted" }> = {
  ok: { label: "API bağlı", tone: "success" },
  unavailable: { label: "manuel", tone: "yellow" },
  pending: { label: "bekliyor", tone: "muted" },
};

/**
 * IG rakip watchlist yönetimi (Phase 5A / ADR-044) — emekliye ayrılan
 * CompetitorRadarSection'ın benzersiz "hesap ekle" eylemini canonical Plan/Fırsatlar
 * radar segmentine taşır. Watchlist GLOBALDİR (CemOS ortak rakip listesi). Ekleme +
 * liste Meta OLMADAN da çalışır; yalnız OTOMATİK outlier senkronu business_discovery
 * gerektirir → yapılandırılmamışsa dürüst blocked-external (liste beklemede).
 */
export default function CompetitorWatchlistCard() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<WatchAccount[]>([]);
  const [max, setMax] = useState(0);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/instagram/watchlist");
      if (!res.ok) throw new Error("http");
      const json = (await res.json()) as WatchlistResponse;
      if (!json.success) throw new Error("payload");
      setAccounts(json.accounts ?? []);
      setMax(json.max ?? 0);
      setConfigured(json.configured !== false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const atLimit = max > 0 && accounts.length >= max;

  const add = async () => {
    const handle = username.trim().replace(/^@/, "");
    if (!handle || adding || atLimit) return;
    setAdding(true);
    try {
      const res = await fetch("/api/instagram/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: handle, isCompetitor: true }),
      });
      const json = (await res.json().catch(() => ({}))) as WatchlistResponse;
      if (!res.ok || json.success === false) {
        toast.error(json.error || "Hesap eklenemedi.");
        return;
      }
      setUsername("");
      toast.success(`@${handle} izlemeye eklendi.`);
      await load();
    } catch {
      toast.error("Hesap eklenemedi.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card variant="feature" padded data-testid="competitor-watchlist">
      <SectionHeader
        eyebrow="RAKİP RADARI"
        title="İzlenen rakip hesaplar"
        description="CemOS ortak rakip listesi (hesap-bazlı değil) — outlier feed'i besler. Tek otomatik kaynak: Meta business_discovery (scraping asla)."
      />

      {!configured && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <BlockedExternalState
            compact
            title="Meta business_discovery yapılandırılmamış"
            description="Hesap ekleyebilirsin, ancak otomatik outlier senkronu Meta erişimi gerektirir — yapılandırılana dek liste beklemede kalır."
            detail="Gereken env: META_IG_USER_ID + business_discovery izinli Meta token'ı. Composio own-account köprüsü rakip verisi için KULLANILAMAZ."
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
            placeholder="rakip @kullanıcı"
            aria-label="Rakip hesap ekle"
            data-testid="watchlist-add-input"
            disabled={atLimit}
          />
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={add}
          loading={adding}
          disabled={atLimit}
          iconLeft={<Plus size={14} strokeWidth={2} />}
          data-testid="watchlist-add-btn"
        >
          Ekle
        </Button>
      </div>
      {atLimit && (
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
          Watchlist sınırı doldu ({max}). Yeni rakip için önce bir hesap kaldır.
        </p>
      )}

      {loading ? (
        <Skeleton lines={3} />
      ) : failed ? (
        <ErrorState compact title="Watchlist yüklenemedi" description="Rakip listesi getirilemedi." onRetry={load} />
      ) : accounts.length === 0 ? (
        <EmptyState
          compact
          icon={<Users size={20} strokeWidth={1.8} />}
          title="Henüz rakip eklenmedi"
          description="Bir rakip @kullanıcı ekle — outlier radar onu izlemeye başlar (Meta yapılandırıldığında)."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {accounts.map((a, i) => {
            const probe = PROBE[a.probeStatus] ?? PROBE.pending;
            return (
              <div
                key={a.id}
                data-testid="watchlist-row"
                style={{
                  display: "flex", alignItems: "center", gap: 8, minHeight: 40,
                  padding: "6px 2px", borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  @{a.username}
                </span>
                <Badge variant={probe.tone} size="xs">{probe.label}</Badge>
                {a.lastSyncAt && (
                  <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                    {new Date(a.lastSyncAt).toLocaleDateString("tr-TR")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
