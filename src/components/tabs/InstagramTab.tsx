"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Camera as Instagram,
  MessageSquare,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  KeyRound,
  Image as ImageIcon,
  ArrowLeft,
  ExternalLink,
  Inbox,
  Filter,
  X,
  Copy,
  Send,
  Pencil,
  Settings2,
  FileText,
} from "lucide-react";
import { useXAgentStore } from "@/store/xagent";
import { EmptyState, SubNav } from "@/components/ui";
import DmInbox from "@/components/instagram/DmInbox";
import InsightsPanel from "@/components/instagram/InsightsPanel";

type SubTab = "comments" | "dm" | "stats";

type IgComment = {
  commentId: string;
  mediaId: string;
  username: string;
  text: string;
  trText: string;
  lang: string;
  intent: string;
  sentiment: string;
  priority: number;
  status: string;
};

type IgReplyDraft = {
  id: string;
  commentId: string;
  variant: number;
  textTr: string;
  textOriginal: string | null;
  tone: string;
  status: string;
  riskWarning: boolean;
};

type TokenHealth = {
  configured: boolean;
  source: string;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  status: "ok" | "warn" | "critical" | "unknown";
};

const INTENTS = ["soru", "övgü", "eleştiri", "istek", "spam", "diğer"];
const INTENT_LABEL: Record<string, string> = {
  soru: "Soru",
  övgü: "Övgü",
  eleştiri: "Eleştiri",
  istek: "İstek",
  spam: "Spam",
  diğer: "Diğer",
};

const card: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-xl)",
  boxShadow: "var(--highlight-top)",
  padding: 14,
};

/** Yorumları ait oldukları gönderiye (mediaId) göre, sırayı koruyarak grupla. */
function groupByMedia(comments: IgComment[]): Array<[string, IgComment[]]> {
  const map = new Map<string, IgComment[]>();
  for (const c of comments) {
    const arr = map.get(c.mediaId) ?? [];
    arr.push(c);
    map.set(c.mediaId, arr);
  }
  return [...map.entries()];
}
const accentBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--accent-fg)",
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
};
const selStyle: React.CSSProperties = {
  background: "#0e0e0e",
  color: "var(--text-primary)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
};
const miniBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--accent)",
  border: "1px solid rgba(155,44,52,0.3)",
  borderRadius: 5,
  padding: "2px 8px",
  fontSize: 11,
  cursor: "pointer",
};
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 300,
};
const drawerStyle: React.CSSProperties = {
  width: "min(640px, 100%)",
  height: "100%",
  background: "#0a0a0a",
  borderLeft: "1px solid rgba(255,255,255,0.1)",
  padding: 20,
  overflowY: "auto",
};

function intentColor(intent: string): string {
  if (intent === "soru") return "#5cc8ff";
  if (intent === "eleştiri") return "#ff5c5c";
  if (intent === "istek") return "#ffb428";
  if (intent === "övgü") return "var(--accent)";
  return "var(--text-secondary)";
}

function priorityColor(p: number): string {
  if (p >= 60) return "#ff5c5c";
  if (p >= 40) return "#ffb428";
  return "var(--text-secondary)";
}

async function postJson(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const SUB_TABS: ReadonlyArray<{ id: SubTab; label: string }> = [
  { id: "comments", label: "Yorumlar" },
  { id: "dm", label: "DM Kutusu" },
  { id: "stats", label: "İstatistikler" },
];

export default function InstagramTab() {
  const igDeepLink = useXAgentStore((s) => s.igDeepLink);
  const setIgDeepLink = useXAgentStore((s) => s.setIgDeepLink);
  const [subTab, setSubTab] = useState<SubTab>("comments");

  // morning kartından gelen deep-link'i uygula ve temizle
  useEffect(() => {
    if (igDeepLink) {
      setSubTab(igDeepLink);
      setIgDeepLink(null);
    }
  }, [igDeepLink, setIgDeepLink]);

  const [configured, setConfigured] = useState(true);
  const [comments, setComments] = useState<IgComment[]>([]);
  const [media, setMedia] = useState<Record<string, { caption: string; permalink: string; postedAt: string | null }>>({});
  const [mediaOrder, setMediaOrder] = useState<string[]>([]);
  // İçerik-önce: seçili gönderi (null = gönderi listesi göster).
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [tokenHealth, setTokenHealth] = useState<TokenHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bulking, setBulking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // filtreler
  const [statusFilter, setStatusFilter] = useState("all");
  const [intentFilter, setIntentFilter] = useState("all");
  const [minPriority, setMinPriority] = useState("");

  // taslak drawer
  const [active, setActive] = useState<IgComment | null>(null);
  const [drafts, setDrafts] = useState<IgReplyDraft[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (intentFilter !== "all") qs.set("intent", intentFilter);
      if (minPriority !== "") qs.set("minPriority", minPriority);
      const res = await fetch(`/api/instagram/comments?${qs.toString()}`);
      const json = await res.json();
      setConfigured(json.configured ?? false);
      setTokenHealth(json.tokenHealth ?? null);
      setComments(json.comments ?? []);
      setMedia(json.media ?? {});
      setMediaOrder(json.mediaOrder ?? []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, intentFilter, minPriority]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Comments grouped by post for O(1) lookup while iterating the full media list.
  const commentsByMedia = new Map<string, IgComment[]>(groupByMedia(comments));

  const runSync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await postJson("/api/instagram/sync");
      const json = await res.json();
      if (json.success) {
        // Fail-open: success:true ama 0 medya + Meta hatası → gerçek nedeni göster.
        if ((json.mediaSynced ?? 0) === 0 && (json.mediaError || (json.errors ?? 0) > 0)) {
          setNotice(
            `Meta hatası: ${
              json.mediaError ||
              "medya çekilemedi — token süresi dolmuş olabilir, 'Token Yenile' deneyin (docs/META_KURULUM.md)."
            }`
          );
        } else {
          const dmNote = json.dmError ? ` · DM hatası: ${json.dmError}` : "";
          setNotice(
            `Sync: ${json.mediaSynced ?? 0} gönderi, ${json.commentsUpserted ?? 0} yorum, ${json.classified ?? 0} sınıflandırıldı, ${json.dmMessages ?? 0} DM.${dmNote}`
          );
        }
        await loadFeed();
      } else {
        setNotice(`Sync hatası: ${json.error || json.code}`);
      }
    } finally {
      setSyncing(false);
    }
  };

  const refreshToken = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const res = await postJson("/api/instagram/token");
      const json = await res.json();
      if (json.success) {
        setNotice(`Token yenilendi — ${json.daysUntilExpiry ?? "?"} gün geçerli.`);
        await loadFeed();
      } else {
        setNotice(`Token yenilenemedi: ${json.error}`);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const bulkDrafts = async () => {
    setBulking(true);
    setNotice(null);
    try {
      const res = await postJson("/api/instagram/drafts", { bulk: true });
      const json = await res.json();
      if (json.success) {
        setNotice(`${json.generated ?? 0} yoruma taslak üretildi.`);
        await loadFeed();
      } else {
        setNotice(`Toplu taslak hatası: ${json.error || json.code}`);
      }
    } finally {
      setBulking(false);
    }
  };

  const openDrafts = async (comment: IgComment) => {
    setActive(comment);
    setDrafts([]);
    setDraftLoading(true);
    try {
      const res = await fetch(`/api/instagram/comments/${comment.commentId}/drafts`);
      const json = await res.json();
      hydrateDrafts(json.drafts ?? []);
    } finally {
      setDraftLoading(false);
    }
  };

  const generateDrafts = async (comment: IgComment) => {
    setActive(comment);
    setDrafts([]);
    setDraftLoading(true);
    setNotice(null);
    try {
      const res = await postJson(`/api/instagram/comments/${comment.commentId}/drafts`);
      const json = await res.json();
      if (json.success) {
        hydrateDrafts(json.drafts ?? []);
        void loadFeed();
      } else {
        setNotice(
          json.code === "budget" ? "Aylık IG bütçesi doldu." : `Taslak üretilemedi: ${json.error}`
        );
      }
    } finally {
      setDraftLoading(false);
    }
  };

  function hydrateDrafts(list: IgReplyDraft[]) {
    setDrafts(list);
    const next: Record<string, string> = {};
    for (const d of list) next[d.id] = d.textOriginal || d.textTr;
    setEdits(next);
  }

  const dismissComment = (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.commentId !== commentId));
    // Optimistik gizleme; PATCH best-effort (hata olsa da yorum UI'dan düşürülür).
    void fetch(`/api/instagram/comments/${commentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "ignored" }),
    }).catch(() => {});
  };

  const draftAction = async (draftId: string, action: "sent" | "edited" | "dismissed") => {
    const editedText = edits[draftId];
    const res = await fetch(`/api/instagram/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, editedText }),
    });
    const json = await res.json();
    if (!json.success) {
      setNotice(`Kaydedilemedi: ${json.error}`);
      return;
    }
    if (action === "sent") {
      setNotice("Gönderildi olarak işaretlendi.");
      setActive(null);
      void loadFeed();
    } else if (action === "edited") {
      setNotice("Düzenleme kaydedildi.");
    } else {
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  const showTokenBand =
    tokenHealth && (tokenHealth.status === "warn" || tokenHealth.status === "critical");

  const notConfiguredCard = (
    <div style={{ ...card, maxWidth: 560 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Instagram Yorumlar</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
        Meta erişimi ayarlı değil. <code>META_IG_USER_ID</code>, <code>META_APP_ID</code>,{" "}
        <code>META_APP_SECRET</code> ve token gerekiyor. Kurulum:{" "}
        <code>docs/META_KURULUM.md</code> (Geliştirici modu — App Review gerekmez). Yapılandırılana
        kadar motor boş durumda kalır, hata vermez.
      </p>
    </div>
  );

  const commentsView = !configured ? (
    notConfiguredCard
  ) : (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Instagram Yorumlar</h2>
        <button style={ghostBtn} disabled={bulking} onClick={bulkDrafts}>
          {bulking ? "Üretiliyor…" : "Öncelikli (≥60) → Taslak"}
        </button>
        <button style={ghostBtn} disabled={syncing} onClick={runSync}>
          {syncing ? "Sync…" : "Sync"}
        </button>
      </div>

      {showTokenBand && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background:
              tokenHealth!.status === "critical" ? "rgba(255,92,92,0.1)" : "rgba(255,180,40,0.1)",
            border: `1px solid ${
              tokenHealth!.status === "critical" ? "rgba(255,92,92,0.35)" : "rgba(255,180,40,0.3)"
            }`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            color: tokenHealth!.status === "critical" ? "#ff5c5c" : "#ffb428",
            marginBottom: 12,
          }}
        >
          <span style={{ flex: 1 }}>
            Meta token {tokenHealth!.daysUntilExpiry ?? "?"} gün sonra geçersiz olacak — şimdi
            yenileyin.
          </span>
          <button style={ghostBtn} disabled={refreshing} onClick={refreshToken}>
            {refreshing ? "Yenileniyor…" : "Token Yenile"}
          </button>
        </div>
      )}

      {notice && (
        <div style={{ ...card, marginBottom: 12, fontSize: 13, color: "var(--text-secondary)" }}>
          {notice}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selStyle}>
          <option value="all">Tüm durumlar</option>
          <option value="new">Yeni</option>
          <option value="analyzed">Sınıflandırıldı</option>
          <option value="drafted">Taslaklı</option>
          <option value="replied">Yanıtlandı</option>
        </select>
        <select value={intentFilter} onChange={(e) => setIntentFilter(e.target.value)} style={selStyle}>
          <option value="all">Tüm niyetler</option>
          {INTENTS.map((i) => (
            <option key={i} value={i}>
              {INTENT_LABEL[i]}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Min öncelik"
          value={minPriority}
          onChange={(e) => setMinPriority(e.target.value)}
          style={{ ...selStyle, width: 110 }}
        />
        <button style={ghostBtn} onClick={loadFeed}>
          Filtrele
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Yükleniyor…</p>
      ) : mediaOrder.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>
          Henüz gönderi yok. Sync çalıştırın (Meta kurulumu sonrası).
        </p>
      ) : selectedMediaId === null ? (
        /* İçerik (gönderi) listesi — her gönderi, 0 yorumlu olsa bile görünür */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {mediaOrder.map((mediaId) => {
            const items = commentsByMedia.get(mediaId) ?? [];
            return (
            <button
              key={mediaId}
              onClick={() => setSelectedMediaId(mediaId)}
              style={{
                ...card,
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: "var(--gradient-accent), var(--bg-surface)",
                border: "1px solid var(--accent-border)",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 700, color: "var(--accent-text)", fontSize: 12 }}>📷 Gönderi</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--accent-fg)",
                    background: "var(--accent)",
                    borderRadius: "var(--radius-sm)",
                    padding: "2px 8px",
                  }}
                >
                  {items.length} yorum
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-primary)",
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  minHeight: 36,
                }}
              >
                {media[mediaId]?.caption?.trim() || "(başlıksız gönderi)"}
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Yorumları gör →</span>
            </button>
            );
          })}
        </div>
      ) : (
        /* Seçili gönderinin yorumları */
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <button onClick={() => setSelectedMediaId(null)} style={ghostBtn}>
              ← Tüm gönderiler
            </button>
            <span
              style={{
                flex: 1,
                fontSize: 12,
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {media[selectedMediaId]?.caption?.trim() || "(başlıksız gönderi)"}
            </span>
            {media[selectedMediaId]?.permalink && (
              <a
                href={media[selectedMediaId].permalink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-text)", fontSize: 11, whiteSpace: "nowrap" }}
              >
                Gönderiye git ↗
              </a>
            )}
          </div>
          {comments.filter((c) => c.mediaId === selectedMediaId).map((c) => (
            <div key={c.commentId} style={card}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12 }}
              >
                <strong style={{ fontSize: 13 }}>@{c.username || "?"}</strong>
                <span
                  style={{
                    color: intentColor(c.intent),
                    border: `1px solid ${intentColor(c.intent)}`,
                    borderRadius: 5,
                    padding: "1px 7px",
                    fontSize: 11,
                  }}
                >
                  {INTENT_LABEL[c.intent] ?? c.intent ?? "—"}
                </span>
                <span style={{ color: priorityColor(c.priority), fontWeight: 700 }}>{c.priority}</span>
                <span style={{ color: "var(--text-secondary)", flex: 1 }}>{c.sentiment}</span>
                {c.lang && c.lang !== "tr" && (
                  <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>
                    {c.lang.toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>{c.text}</div>
              {c.trText && c.lang && c.lang !== "tr" && (
                <div
                  style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)", marginTop: 4 }}
                >
                  TR: {c.trText}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button style={accentBtn} onClick={() => generateDrafts(c)}>
                  Yanıt Taslağı Üret
                </button>
                {c.status === "drafted" && (
                  <button style={ghostBtn} onClick={() => openDrafts(c)}>
                    Taslakları Gör
                  </button>
                )}
                <button style={ghostBtn} onClick={() => dismissComment(c.commentId)}>
                  Yoksay
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {active && (
        <DraftDrawer
          comment={active}
          drafts={drafts}
          loading={draftLoading}
          edits={edits}
          setEdit={(id, v) => setEdits((prev) => ({ ...prev, [id]: v }))}
          onClose={() => setActive(null)}
          onCopy={copy}
          onAction={draftAction}
        />
      )}
    </>
  );

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {SUB_TABS.map((t) => {
          const isActive = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              style={{
                padding: "8px 14px",
                border: "none",
                background: "transparent",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === "comments" && commentsView}
      {subTab === "dm" && <DmInbox />}
      {subTab === "stats" && <InsightsPanel />}
    </div>
  );
}

function DraftDrawer({
  comment,
  drafts,
  loading,
  edits,
  setEdit,
  onClose,
  onCopy,
  onAction,
}: {
  comment: IgComment;
  drafts: IgReplyDraft[];
  loading: boolean;
  edits: Record<string, string>;
  setEdit: (id: string, value: string) => void;
  onClose: () => void;
  onCopy: (text: string) => void;
  onAction: (draftId: string, action: "sent" | "edited" | "dismissed") => void;
}) {
  const riskWarning = drafts.some((d) => d.riskWarning);
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={drawerStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>Yanıt Taslakları</h3>
          <button style={ghostBtn} onClick={onClose}>
            Kapat
          </button>
        </div>

        <div style={{ ...card, marginBottom: 12, padding: 10 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            @{comment.username || "?"} · {INTENT_LABEL[comment.intent] ?? comment.intent}
          </div>
          <div style={{ fontSize: 13 }}>{comment.text}</div>
          {comment.trText && comment.lang && comment.lang !== "tr" && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              TR: {comment.trText}
            </div>
          )}
        </div>

        {riskWarning && (
          <div
            style={{
              background: "rgba(255,92,92,0.1)",
              border: "1px solid rgba(255,92,92,0.35)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 12,
              color: "#ff5c5c",
              marginBottom: 12,
            }}
          >
            Dikkat: Bu bir eleştiri yanıtı ve risk denetimi düşük güvenlik puanı verdi. Göndermeden
            önce tonu kontrol edin.
          </div>
        )}

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Yükleniyor…</p>
        ) : drafts.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>
            Taslak yok. &quot;Yanıt Taslağı Üret&quot; deneyin.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {drafts.map((d) => {
              const foreign = Boolean(d.textOriginal);
              return (
                <div key={d.id} style={{ ...card, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--accent)" }}>{d.tone || "samimi"}</span>
                    <span style={{ flex: 1 }} />
                    <button style={miniBtn} onClick={() => onCopy(edits[d.id] ?? d.textTr)}>
                      Kopyala
                    </button>
                  </div>

                  {foreign && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                      Türkçe (referans): {d.textTr}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    {foreign ? `Orijinal dilde — bunu gönderin (${comment.lang})` : "Yanıt"}
                  </div>
                  <textarea
                    value={edits[d.id] ?? ""}
                    onChange={(e) => setEdit(d.id, e.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 80,
                      background: "#0e0e0e",
                      color: "var(--text-primary)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 6,
                      padding: 10,
                      fontSize: 13,
                      lineHeight: 1.6,
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <button style={accentBtn} onClick={() => onAction(d.id, "sent")}>
                      Gönderdim
                    </button>
                    <button style={ghostBtn} onClick={() => onAction(d.id, "edited")}>
                      Düzenledim
                    </button>
                    <button style={ghostBtn} onClick={() => onAction(d.id, "dismissed")}>
                      Olmadı
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
