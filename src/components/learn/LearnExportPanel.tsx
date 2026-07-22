"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, HardDrive, GitBranch, RefreshCw, Info } from "lucide-react";
import { Card, Button, Badge } from "@/components/ui";

/**
 * CemOS Learn — Obsidian export paneli (4D). Üç kanal (ZIP / yerel vault / GitHub vault)
 * AYRI + dürüst: configured/unconfigured (yalnız env NAME, secret VALUE yok), son sonuç
 * (succeeded/already_current/partial/conflict/failed), retry. ZIP indirme YEREL/GITHUB
 * SYNC DEĞİLDİR. "Başarılı" YALNIZ gerçek yazma veya already_current sonucudur. Ready
 * olmayan pakette panel kapalı (sunucu da 409/not_ready döner).
 */

type Channel = "zip" | "local_vault" | "github_vault";
type ChannelConfig = { channel: Channel; configured: boolean; envNames: string[]; note: string };
type ChannelResult = {
  channel: Channel;
  state: string;
  written: number;
  unchanged: number;
  failed: number;
  conflict: number;
  targetLabel: string;
  errorClass?: string;
  message?: string;
};

const STATE_LABEL: Record<string, { label: string; variant: "success" | "danger" | "yellow" | "muted" }> = {
  succeeded: { label: "başarılı", variant: "success" },
  already_current: { label: "zaten güncel", variant: "success" },
  partial: { label: "kısmi", variant: "yellow" },
  conflict: { label: "çakışma", variant: "yellow" },
  failed: { label: "başarısız", variant: "danger" },
  not_configured: { label: "yapılandırılmadı", variant: "muted" },
  not_ready: { label: "hazır değil", variant: "muted" },
  prepared: { label: "hazır", variant: "muted" },
  running: { label: "çalışıyor", variant: "muted" },
};

const CHANNEL_META: Record<Channel, { label: string; icon: React.ReactNode }> = {
  zip: { label: "ZIP indir", icon: <Download size={15} strokeWidth={2} /> },
  local_vault: { label: "Yerel vault", icon: <HardDrive size={15} strokeWidth={2} /> },
  github_vault: { label: "GitHub vault", icon: <GitBranch size={15} strokeWidth={2} /> },
};

function newKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function resultLine(r: ChannelResult): string {
  return `yazıldı ${r.written} · değişmedi ${r.unchanged} · çakışma ${r.conflict} · başarısız ${r.failed}`;
}

export default function LearnExportPanel({ packId, folderTitle }: { packId: string; folderTitle: string }) {
  const [channels, setChannels] = useState<ChannelConfig[] | null>(null);
  const [latest, setLatest] = useState<Record<string, ChannelResult>>({});
  const [busy, setBusy] = useState<Channel | null>(null);
  const [zipState, setZipState] = useState<"idle" | "preparing" | "done" | "error">("idle");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/learn/packs/${packId}/export`);
      const json = await res.json();
      if (json.success) {
        setChannels(json.channels ?? []);
        setLatest(json.latest ?? {});
      }
    } catch {
      /* fail-soft: panel yine de ZIP + yapılandırma gösterir */
    }
  }, [packId]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadZip = useCallback(async () => {
    setZipState("preparing");
    try {
      const res = await fetch(`/api/learn/packs/${packId}/obsidian`);
      const json = await res.json();
      if (!json.success) {
        setZipState("error");
        return;
      }
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const enc = new TextEncoder();
      for (const f of json.files as { path: string; content: string }[]) zip.file(f.path, enc.encode(f.content));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${folderTitle || "ogrenme-paketi"}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      setZipState("done");
    } catch {
      setZipState("error");
    }
  }, [packId, folderTitle]);

  const runExport = useCallback(
    async (channel: Channel) => {
      setBusy(channel);
      try {
        const res = await fetch(`/api/learn/packs/${packId}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, idempotencyKey: newKey() }),
        });
        const json = await res.json();
        if (json.success && json.result) {
          setLatest((prev) => ({ ...prev, [channel]: json.result as ChannelResult }));
        }
      } catch {
        /* fail-soft */
      } finally {
        setBusy(null);
      }
    },
    [packId]
  );

  const cfg = (c: Channel) => channels?.find((x) => x.channel === c);

  return (
    <Card variant="quiet" padded data-testid="export-panel" style={{ marginBottom: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Obsidian&apos;a dışa aktar</span>
        <Badge variant="muted" size="sm">yalnız hazır paket</Badge>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* ZIP */}
        <div data-testid="export-channel-zip" style={rowStyle}>
          <div style={iconStyle}>{CHANNEL_META.zip.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={titleRow}>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>ZIP indir</span>
              <Badge variant="success" size="sm">her zaman açık</Badge>
            </div>
            <p style={noteStyle}>
              Tarayıcıda .zip indirir. <b>Yerel/GitHub vault sync&apos;i DEĞİLDİR</b> — dosyaları elle vault&apos;a kopyalarsın.
            </p>
            {zipState === "done" && <p style={okNote}>ZIP indirildi (yalnız indirme — sync yapılmadı).</p>}
            {zipState === "error" && <p style={errNote}>ZIP hazırlanamadı.</p>}
          </div>
          <Button size="sm" variant="secondary" onClick={downloadZip} disabled={zipState === "preparing"} loading={zipState === "preparing"} data-testid="export-run-zip">
            İndir
          </Button>
        </div>

        {/* Yerel + GitHub */}
        {(["local_vault", "github_vault"] as Channel[]).map((ch) => {
          const c = cfg(ch);
          const r = latest[ch];
          const configured = c?.configured ?? false;
          const st = r ? STATE_LABEL[r.state] ?? { label: r.state, variant: "muted" as const } : null;
          return (
            <div key={ch} data-testid={`export-channel-${ch}`} style={rowStyle}>
              <div style={iconStyle}>{CHANNEL_META[ch].icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={titleRow}>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{CHANNEL_META[ch].label}</span>
                  <Badge variant={configured ? "success" : "muted"} size="sm">
                    {configured ? "yapılandırıldı" : "yapılandırılmadı"}
                  </Badge>
                  {st && (
                    <span data-testid={`export-result-${ch}`}>
                      <Badge variant={st.variant} size="sm">{st.label}</Badge>
                    </span>
                  )}
                </div>
                {c?.note && <p style={noteStyle}>{c.note}</p>}
                {!configured && c && c.envNames.length > 0 && (
                  <p style={noteStyle}>
                    Kurulum env: {c.envNames.map((n) => <code key={n} style={codeStyle}>{n}</code>)}
                  </p>
                )}
                {r && (
                  <p style={{ ...noteStyle, color: "var(--text-secondary)" }}>
                    {resultLine(r)}
                    {r.errorClass ? ` · sınıf: ${r.errorClass}` : ""}
                    {r.targetLabel ? ` · hedef: ${r.targetLabel}` : ""}
                  </p>
                )}
              </div>
              {configured && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => runExport(ch)}
                  disabled={busy === ch}
                  loading={busy === ch}
                  iconLeft={busy === ch ? undefined : <RefreshCw size={13} strokeWidth={2} />}
                  data-testid={`export-run-${ch}`}
                >
                  {r ? "Yeniden aktar" : "Aktar"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ ...noteStyle, marginTop: 10, display: "flex", gap: 6, alignItems: "flex-start" }}>
        <Info size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
        Yalnız QA&apos;dan geçmiş (hazır) paket dışa aktarılabilir. &quot;Başarılı&quot; = gerçek yazma veya zaten güncel. Aynı içerik ikinci kez aktarılınca commit/dosya değişmez (idempotent).
      </p>
    </Card>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "10px 12px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
};
const iconStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 30,
  height: 30,
  flexShrink: 0,
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-faint)",
  color: "var(--text-muted)",
};
const titleRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const noteStyle: React.CSSProperties = { margin: "3px 0 0", fontSize: "var(--text-2xs)", color: "var(--text-muted)", lineHeight: 1.5 };
const okNote: React.CSSProperties = { ...noteStyle, color: "var(--status-ok-text, var(--text-secondary))" };
const errNote: React.CSSProperties = { ...noteStyle, color: "var(--status-warn-text)" };
const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-2xs)",
  background: "var(--bg-sunken)",
  border: "1px solid var(--border-faint)",
  borderRadius: "var(--radius-sm)",
  padding: "1px 5px",
  marginRight: 4,
};
