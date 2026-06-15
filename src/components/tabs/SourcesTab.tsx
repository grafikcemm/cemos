"use client";

import { useState, useEffect, useCallback } from "react";
import { Radio, RefreshCw, Plus, Heart, Repeat2, AlertCircle, Inbox } from "lucide-react";
import { useXAgentStore, type Channel } from "@/store/xagent";
import SourceCard from "@/components/agent/SourceCard";
import ModeSelector from "@/components/ui/ModeSelector";
import { PageHeader, Card, Button, Input, EmptyState, Skeleton } from "@/components/ui";

type DbSource = {
  id: string;
  accountId: string;
  handle: string;
  displayName: string | null;
  enabled: boolean;
  mode: "ALL" | "TWEET" | "QUOTE" | "REPLY";
  thresholdLikes: number;
  thresholdRetweets: number;
  archivedAt: string | null;
  createdAt: string;
};

const CHANNELS: Channel[] = ["grafikcem", "maskulenkod"];

export default function SourcesTab() {
  const activeChannel = useXAgentStore((s) => s.activeChannel);
  const [sources, setSources] = useState<Record<Channel, DbSource[]>>({
    grafikcem: [], maskulenkod: []
  });
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<Channel | null>(null);
  const [newHandle, setNewHandle] = useState("");
  const [newMode, setNewMode] = useState<"ALL" | "TWEET" | "QUOTE" | "REPLY">("TWEET");
  const [newLikes, setNewLikes] = useState("100");
  const [newRTs, setNewRTs] = useState("20");
  const [addError, setAddError] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        CHANNELS.map((ch) =>
          fetch(`/api/sources?account=${ch}`)
            .then((r) => r.json() as Promise<{ success: boolean; sources?: DbSource[] }>)
            .then((d) => ({ ch, items: d.sources ?? [] }))
            .catch(() => ({ ch, items: [] as DbSource[] }))
        )
      );
      const map = { grafikcem: [], maskulenkod: []} as Record<Channel, DbSource[]>;
      for (const { ch, items } of results) map[ch] = items;
      setSources(map);
    } finally {
      setLoading(false);
    }
  }, []);

   
  useEffect(() => { loadSources(); }, [loadSources]);

  const handleAdd = async () => {
    if (!adding || !newHandle.trim()) return;
    setAddError(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHandle: adding,
          handle: newHandle.replace("@", "").trim(),
          mode: newMode,
          thresholdLikes: parseInt(newLikes) || 100,
          thresholdRetweets: parseInt(newRTs) || 20
        })
      });
      const data = (await res.json()) as { success: boolean; source?: DbSource; error?: string };
      if (!data.success) { setAddError(data.error ?? "Eklenemedi"); return; }
      if (data.source) {
        setSources((prev) => ({ ...prev, [adding]: [data.source!, ...prev[adding]] }));
      }
      setAdding(null); setNewHandle(""); setNewMode("TWEET"); setNewLikes("100"); setNewRTs("20");
    } catch {
      setAddError("Ağ hatası");
    }
  };

  const handleUpdate = async (id: string, ch: Channel, updates: Partial<Pick<DbSource, "enabled" | "mode">>) => {
    setSources((prev) => ({
      ...prev,
      [ch]: prev[ch].map((s) => (s.id === id ? { ...s, ...updates } : s))
    }));
    try {
      await fetch(`/api/sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
    } catch {
      loadSources();
    }
  };

  const handleArchive = async (id: string, ch: Channel) => {
    setSources((prev) => ({ ...prev, [ch]: prev[ch].filter((s) => s.id !== id) }));
    try {
      await fetch(`/api/sources/${id}`, { method: "DELETE" });
    } catch {
      loadSources();
    }
  };

  void activeChannel;

  const totalSources = CHANNELS.reduce((acc, ch) => acc + sources[ch].length, 0);

  return (
    <div>
      <PageHeader
        eyebrow="İZLE"
        title="Kaynaklar"
        subtitle="Her hesabın viral içerik beslemesini buradan yönet — izlenecek X hesapları, mod ve etkileşim eşikleri."
        actions={
          <Button variant="ghost" size="sm" onClick={loadSources} disabled={loading}>
            <RefreshCw
              size={15}
              strokeWidth={1.8}
              style={{ animation: loading ? "spin 0.9s linear infinite" : undefined }}
            />
            {loading ? "Yenileniyor…" : "Yenile"}
          </Button>
        }
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Radio size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
              <strong className="tnum" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                {totalSources}
              </strong>{" "}
              izlenen kaynak
            </span>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span>
              <strong className="tnum" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                {CHANNELS.length}
              </strong>{" "}
              hesap
            </span>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)" }}>
        {CHANNELS.map((ch) => {
          const chSources = sources[ch];
          return (
            <Card key={ch} variant="quiet" padded={false} style={{ overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "var(--space-4) var(--space-4) var(--space-3)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  className="font-display"
                  style={{
                    fontSize: "var(--text-md)",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  @{ch}
                </span>
                <span className="eyebrow tnum" style={{ color: "var(--text-muted)" }}>
                  {chSources.length} kaynak
                </span>
              </div>

              <div style={{ padding: "var(--space-3) var(--space-3) 0" }}>
                <button
                  onClick={() => { setAdding(ch); setAddError(null); }}
                  style={{
                    width: "100%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    background: "transparent",
                    border: "1px dashed var(--border-strong)",
                    borderRadius: "var(--radius-md)",
                    padding: "9px 0",
                    fontSize: "var(--text-sm)",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                    marginBottom: "var(--space-2)",
                    fontWeight: 600,
                    transition: "border-color var(--ease-out, 0.2s), color var(--ease-out, 0.2s)",
                  }}
                >
                  <Plus size={15} strokeWidth={2} />
                  Kaynak Ekle
                </button>

                {adding === ch && (
                  <Card variant="default" style={{ marginBottom: "var(--space-2)" }}>
                    <Input
                      value={newHandle}
                      onChange={(e) => setNewHandle(e.target.value)}
                      placeholder="@twitter_handle"
                      style={{ marginBottom: "var(--space-2)" }}
                    />
                    <div style={{ marginBottom: "var(--space-2)" }}>
                      <ModeSelector value={newMode} onChange={setNewMode} />
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                      <div style={{ flex: 1 }}>
                        <div
                          className="eyebrow"
                          style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, color: "var(--text-muted)" }}
                        >
                          <Heart size={12} strokeWidth={2} style={{ color: "var(--danger)" }} />
                          Min beğeni
                        </div>
                        <Input
                          value={newLikes}
                          onChange={(e) => setNewLikes(e.target.value)}
                          className="tnum"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          className="eyebrow"
                          style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, color: "var(--text-muted)" }}
                        >
                          <Repeat2 size={12} strokeWidth={2} style={{ color: "var(--green)" }} />
                          Min RT
                        </div>
                        <Input
                          value={newRTs}
                          onChange={(e) => setNewRTs(e.target.value)}
                          className="tnum"
                        />
                      </div>
                    </div>
                    {addError && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: "var(--text-sm)",
                          color: "var(--danger)",
                          marginBottom: "var(--space-2)",
                        }}
                      >
                        <AlertCircle size={14} strokeWidth={2} />
                        {addError}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "var(--space-2)" }}>
                      <Button variant="ghost" size="sm" onClick={() => setAdding(null)} style={{ flex: 1 }}>
                        İptal
                      </Button>
                      <Button variant="primary" size="sm" onClick={handleAdd} style={{ flex: 1 }}>
                        Ekle
                      </Button>
                    </div>
                  </Card>
                )}

                {loading && chSources.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", paddingBottom: "var(--space-3)" }}>
                    <Skeleton height={64} />
                    <Skeleton height={64} />
                  </div>
                ) : chSources.length === 0 ? (
                  <div style={{ paddingBottom: "var(--space-2)" }}>
                    <EmptyState
                      compact
                      icon={<Inbox size={18} strokeWidth={1.8} />}
                      title="Kaynak yok"
                      description="Bu hesap için henüz izlenen bir X kaynağı eklenmemiş."
                    />
                  </div>
                ) : (
                  <div style={{ paddingBottom: "var(--space-2)" }}>
                    {chSources.map((s) => (
                      <div key={s.id} style={{ marginBottom: "var(--space-1)" }}>
                        <SourceCard
                          source={{ ...s, displayName: s.displayName ?? undefined, channel: ch }}
                          onToggle={(en) => handleUpdate(s.id, ch, { enabled: en })}
                          onModeChange={(m) => handleUpdate(s.id, ch, { mode: m })}
                          onArchive={() => handleArchive(s.id, ch)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
