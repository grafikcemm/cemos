"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Plus, Sparkles, Link2, StickyNote, Camera, Video, ArrowUpRight } from "lucide-react";
import { Card, EntityCard, EmptyState, ErrorState, Badge, Button, Skeleton, Drawer, Input, Textarea, BlockedExternalState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useXAgentStore } from "@/store/xagent";
import { useAccounts } from "@/components/plan/useAccounts";

/**
 * Kütüphane / İlham (05 §D2) — panolar + rakip içerik yapısal analizi. Backend
 * (boards/ideas/reverse-engineer) mevcut, UI greenfield. Yapısal analiz GERÇEK
 * (reverse-engineer) ya da dürüst "analiz edilmedi" — SAHTE AI analizi YOK. Yapı
 * çıkar, rakip metnini yeniden yayımlama. Derin capture (uzantı/mobil) Faz 4 →
 * dürüst "yakında". Bare host.
 */

type Board = { id: string; name: string; description?: string; icon?: string };
type ContentJoin = { id: string; title?: string; body?: string; platform?: string; author?: string; canonicalUrl?: string } | null;
type BoardItem = { id: string; itemType: string; title?: string; url?: string; note?: string; contentItem?: ContentJoin };
type IdeaResult = { id?: string; title?: string; angle?: string; hook?: string; whyNow?: string; bodyOutline?: string };

export default function LibIlhamTab() {
  const toast = useToast();
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const { accounts } = useAccounts();

  const [boards, setBoards] = useState<Board[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [capUrl, setCapUrl] = useState("");
  const [capTitle, setCapTitle] = useState("");
  const [capNote, setCapNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [active, setActive] = useState<BoardItem | null>(null);
  const [analysis, setAnalysis] = useState<IdeaResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  const loadBoards = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/boards");
      if (!res.ok) throw new Error("http");
      const json = await res.json();
      if (!json.success) throw new Error("payload");
      const rows: Board[] = json.boards ?? [];
      setBoards(rows);
      setSelectedId((prev) => (prev && rows.some((b) => b.id === prev) ? prev : (rows[0]?.id ?? "")));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  const loadItems = useCallback(async (boardId: string) => {
    if (!boardId) {
      setItems([]);
      return;
    }
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/boards/${boardId}`);
      const json = await res.json();
      setItems(json?.board?.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems(selectedId);
  }, [selectedId, loadItems]);

  const createBoard = async () => {
    const name = window.prompt("Yeni pano adı:");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), accountId: accounts[0]?.id }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Pano oluşturuldu.");
        await loadBoards();
        if (json.board?.id) setSelectedId(json.board.id);
      } else {
        toast.error(json.error ?? "Pano oluşturulamadı.");
      }
    } catch {
      toast.error("Pano oluşturulamadı (ağ hatası).");
    }
  };

  const capture = async () => {
    if (!selectedId) {
      toast.error("Önce bir pano seç.");
      return;
    }
    const hasUrl = capUrl.trim().length > 0;
    const hasNote = capNote.trim().length > 0;
    if (!hasUrl && !hasNote) {
      toast.error("URL ya da not gir.");
      return;
    }
    setBusy(true);
    try {
      let contentItemId: string | undefined;
      if (hasUrl) {
        const cRes = await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: capUrl.trim(), title: capTitle.trim() || undefined, body: capNote.trim() || undefined }),
        });
        const cJson = await cRes.json();
        if (!cRes.ok || !cJson.success) throw new Error(cJson.error ?? "content");
        contentItemId = cJson.item?.id;
      }
      const bRes = await fetch(`/api/boards/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          contentItemId
            ? { contentItemId, title: capTitle.trim() || undefined, note: capNote.trim() || undefined }
            : { itemType: "note", title: capTitle.trim() || "Not", note: capNote.trim() },
        ),
      });
      const bJson = await bRes.json();
      if (!bRes.ok || !bJson.success) throw new Error(bJson.error ?? "board");
      toast.success("İlham kaydedildi.");
      setCapUrl("");
      setCapTitle("");
      setCapNote("");
      setCaptureOpen(false);
      await loadItems(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const openItem = (it: BoardItem) => {
    setActive(it);
    setAnalysis(null);
    setAnalyzed(false);
  };

  const analyze = async () => {
    const cid = active?.contentItem?.id;
    if (!cid) {
      toast.error("Bu kayıt içerik havuzuna bağlı değil — analiz edilemez.");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/content/${cid}/reverse-engineer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: accounts[0]?.id, platform: active?.contentItem?.platform }),
      });
      const json = await res.json();
      if (res.status === 402) {
        toast.error("Analiz engelli: üretim bütçesi doldu (OpenRouter).");
        setAnalyzed(true);
        return;
      }
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Analiz başarısız.");
        return;
      }
      const idea: IdeaResult = json.idea ?? json;
      setAnalysis(idea);
      setAnalyzed(true);
      toast.success("Yapısal analiz üretildi.");
    } catch {
      toast.error("Analiz başarısız (ağ hatası).");
    } finally {
      setAnalyzing(false);
    }
  };

  const useIdea = async () => {
    if (!analysis?.id) {
      setActiveTab("morning");
      toast.info("Bugün açıldı — fikri taslağa çevir.");
      return;
    }
    try {
      const res = await fetch(`/api/ideas/${analysis.id}/create-draft`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Fikir taslağa çevrildi — Bugün'de.");
        setActiveTab("morning");
      } else {
        toast.error(json.error ?? "Taslak oluşturulamadı.");
      }
    } catch {
      toast.error("Taslak oluşturulamadı (ağ hatası).");
    }
  };

  if (loading) {
    return (
      <Card padded>
        <Skeleton width={180} height={14} style={{ marginBottom: 14 }} />
        <Skeleton lines={4} />
      </Card>
    );
  }
  if (failed) {
    return <ErrorState title="İlham panoları alınamadı" description="Pano verisi getirilemedi. Yeniden dene." onRetry={loadBoards} />;
  }
  if ((boards ?? []).length === 0) {
    return (
      <EmptyState
        icon={<Bookmark size={22} strokeWidth={1.8} />}
        title="İlham kütüphanen boş"
        description="İlk panoyu oluştur ve rakip/örnek içerikleri (URL veya not) kaydetmeye başla. Ekran görüntüsü ve video ile kayıt yakında."
        action={
          <Button variant="primary" onClick={createBoard} iconLeft={<Plus size={15} strokeWidth={2} />}>
            İlk panoyu oluştur
          </Button>
        }
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
      {/* Pano seçici + kaydet */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 }}>
          {(boards ?? []).map((b) => {
            const active = b.id === selectedId;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                aria-pressed={active}
                style={{
                  padding: "7px 14px",
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
                {b.name}
              </button>
            );
          })}
          <button
            onClick={createBoard}
            aria-label="Pano oluştur"
            style={{ padding: "7px 12px", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-strong)", background: "transparent", color: "var(--text-muted)", fontSize: "var(--text-sm)", fontFamily: "inherit", cursor: "pointer" }}
          >
            + Pano
          </button>
        </div>
        <Button size="sm" variant="primary" onClick={() => setCaptureOpen(true)} iconLeft={<Plus size={14} strokeWidth={2} />} data-testid="ilham-capture-open">
          Kaydet
        </Button>
      </div>

      {/* İçerikler */}
      {itemsLoading ? (
        <Card padded><Skeleton lines={3} /></Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={22} strokeWidth={1.8} />}
          title="Bu pano boş"
          description="Rakip reel/carousel veya web içeriğini URL ya da not olarak kaydet. Sonra yapısal analiz üret."
          compact
          action={
            <Button variant="secondary" onClick={() => setCaptureOpen(true)} iconLeft={<Plus size={15} strokeWidth={2} />}>
              İlk içeriği kaydet
            </Button>
          }
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: "var(--space-4)" }}>
          {items.map((it) => (
            <EntityCard
              key={it.id}
              onClick={() => openItem(it)}
              eyebrow={it.contentItem?.platform || it.itemType}
              title={it.title || it.contentItem?.title || it.contentItem?.author || "İçerik"}
              body={<span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.note || it.contentItem?.body || "—"}</span>}
              badges={it.contentItem ? <Badge variant="muted" size="xs">analiz edilebilir</Badge> : <Badge variant="muted" size="xs">not</Badge>}
            />
          ))}
        </div>
      )}

      {/* Kaydet drawer */}
      <Drawer open={captureOpen} onClose={() => setCaptureOpen(false)} title="İlham kaydet" width={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Kaynak URL (X / IG / YouTube / web)</span>
            <Input value={capUrl} onChange={(e) => setCapUrl(e.target.value)} placeholder="https://…" iconLeft={<Link2 size={15} />} aria-label="Kaynak URL" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Başlık (opsiyonel)</span>
            <Input value={capTitle} onChange={(e) => setCapTitle(e.target.value)} placeholder="Kısa etiket" aria-label="Başlık" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Not / neden ilham verici</span>
            <Textarea value={capNote} onChange={(e) => setCapNote(e.target.value)} rows={4} aria-label="Not" placeholder="Bu içerik neden çalışıyor? (yapı, hook, format)" />
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" onClick={capture} loading={busy} iconLeft={<StickyNote size={14} strokeWidth={2} />} data-testid="ilham-capture-save">
              Kaydet
            </Button>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-2xs)", color: "var(--text-faint)" }}>
              <Camera size={13} /> <Video size={13} /> ekran görüntüsü / video ile kayıt yakında
            </span>
          </div>
        </div>
      </Drawer>

      {/* İçerik detay + analiz drawer */}
      <Drawer open={!!active} onClose={() => setActive(null)} title={active?.title || active?.contentItem?.title || "İçerik"} width={560}>
        {active && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {active.contentItem?.platform && <Badge variant="muted" size="sm">{active.contentItem.platform}</Badge>}
              {active.contentItem?.author && <Badge variant="muted" size="sm">@{active.contentItem.author}</Badge>}
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {active.note || active.contentItem?.body || "İçerik önizlemesi yok."}
            </div>
            {(active.url || active.contentItem?.canonicalUrl) && (
              <a href={active.url || active.contentItem?.canonicalUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <Button size="sm" variant="ghost" iconRight={<ArrowUpRight size={13} strokeWidth={2} />}>Kaynağı aç</Button>
              </a>
            )}

            <div style={{ height: 1, background: "var(--border-faint)" }} />

            {/* Yapısal analiz */}
            {analysis ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="eyebrow" style={{ color: "var(--accent-text)" }}>Yapısal analiz</div>
                {analysis.whyNow && <AnalysisField label="Neden çalışıyor" value={analysis.whyNow} />}
                {analysis.hook && <AnalysisField label="Hook" value={analysis.hook} />}
                {analysis.angle && <AnalysisField label="Nasıl uyarlanır" value={analysis.angle} />}
                {analysis.bodyOutline && <AnalysisField label="İçerik fikri" value={analysis.bodyOutline} />}
                <Button size="sm" variant="primary" onClick={useIdea} iconLeft={<Sparkles size={14} strokeWidth={2} />}>
                  İçerik fikri kullan → Bugün
                </Button>
              </div>
            ) : active.contentItem ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                  {analyzed ? "Analiz üretilemedi (yukarıdaki nedene bak)." : "Bu içerik henüz analiz edilmedi."} Yapısal analiz rakip metnini kopyalamaz — hook/yapı/uyarlama çıkarır.
                </p>
                <Button size="sm" variant="secondary" onClick={analyze} loading={analyzing} iconLeft={<Sparkles size={14} strokeWidth={2} />} data-testid="ilham-analyze">
                  Analiz et
                </Button>
              </div>
            ) : (
              <BlockedExternalState
                compact
                title="Analiz için içerik bağlantısı gerekli"
                description="Bu kayıt bir nottur, içerik havuzuna bağlı değil. URL ile kaydedilen içerikler yapısal analiz edilebilir."
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function AnalysisField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}
