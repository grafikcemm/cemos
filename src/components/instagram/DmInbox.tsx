"use client";

import { useCallback, useEffect, useState } from "react";

type Conversation = {
  conversationId: string;
  participantUsername: string;
  lastMessageAt: string | null;
  hasDrafts: boolean;
};

type Message = {
  messageId: string;
  fromMe: boolean;
  text: string;
  trText: string;
  lang: string;
  sentAt: string | null;
};

type DmDraft = {
  id: string;
  conversationId: string;
  variant: number;
  textTr: string;
  textOriginal: string | null;
  tone: string;
  status: string;
  riskWarning: boolean;
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: 14,
};
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
const miniBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--accent)",
  border: "1px solid rgba(155,44,52,0.3)",
  borderRadius: 5,
  padding: "2px 8px",
  fontSize: 11,
  cursor: "pointer",
};

async function postJson(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export default function DmInbox() {
  const [configured, setConfigured] = useState(true);
  const [pageLinked, setPageLinked] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [drafts, setDrafts] = useState<DmDraft[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [showTr, setShowTr] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/instagram/dm");
      const json = await res.json();
      setConfigured(json.configured ?? false);
      setPageLinked(json.pageLinked ?? false);
      setConversations(json.conversations ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const hydrateDrafts = useCallback((list: DmDraft[]) => {
    setDrafts(list);
    const next: Record<string, string> = {};
    for (const d of list) next[d.id] = d.textOriginal || d.textTr;
    setEdits(next);
  }, []);

  const openConversation = useCallback(
    async (conversationId: string) => {
      setActiveId(conversationId);
      setMessages([]);
      setDrafts([]);
      setLoadingThread(true);
      try {
        const [tRes, dRes] = await Promise.all([
          fetch(`/api/instagram/dm/${conversationId}`),
          fetch(`/api/instagram/dm/${conversationId}/drafts`),
        ]);
        const tJson = await tRes.json();
        const dJson = await dRes.json();
        setMessages(tJson.messages ?? []);
        hydrateDrafts(dJson.drafts ?? []);
      } finally {
        setLoadingThread(false);
      }
    },
    [hydrateDrafts]
  );

  const runSync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await postJson("/api/instagram/sync");
      const json = await res.json();
      let message: string;
      if (!json.success) {
        message = `Sync hatası: ${json.error || json.code}`;
      } else if (json.dmError) {
        // Fail-open: media/comments synced but Meta DM fetch failed — surface the real cause.
        message = `Kısmi sync: ${json.dmConversations ?? 0} konuşma, ${json.dmMessages ?? 0} mesaj. DM hatası: ${json.dmError}`;
      } else {
        message = `Sync: ${json.dmConversations ?? 0} konuşma, ${json.dmMessages ?? 0} mesaj, ${json.dmTranslated ?? 0} çevrildi.`;
      }
      setNotice(message);
      await loadList();
      if (activeId) await openConversation(activeId);
    } finally {
      setSyncing(false);
    }
  };

  const generateDrafts = async () => {
    if (!activeId) return;
    setGenerating(true);
    setNotice(null);
    try {
      const res = await postJson(`/api/instagram/dm/${activeId}/drafts`);
      const json = await res.json();
      if (json.success) {
        hydrateDrafts(json.drafts ?? []);
        void loadList();
      } else {
        setNotice(json.code === "budget" ? "Aylık IG bütçesi doldu." : `Taslak üretilemedi: ${json.error}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const draftAction = async (draftId: string, action: "sent" | "edited" | "dismissed") => {
    const editedText = edits[draftId];
    const res = await fetch(`/api/instagram/dm-drafts/${draftId}`, {
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
      setDrafts([]);
      void loadList();
    } else if (action === "edited") {
      setNotice("Düzenleme kaydedildi.");
    } else {
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  if (!configured || !pageLinked) {
    return (
      <div style={{ ...card, maxWidth: 600 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Instagram DM</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
          {!configured ? (
            <>
              Meta erişimi ayarlı değil (token / IG user id eksik). Kurulum:{" "}
              <code>docs/META_KURULUM.md</code>.
            </>
          ) : (
            <>
              DM okuma için bağlı bir Facebook Sayfası gerekiyor (<code>META_PAGE_ID</code> +{" "}
              <code>pages_show_list</code> izni + Sayfa↔Instagram bağlantısı). Yapılandırılana kadar
              DM kutusu boş kalır.
            </>
          )}
        </p>
      </div>
    );
  }

  const active = conversations.find((c) => c.conversationId === activeId) ?? null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>DM Kutusu</h3>
        <button style={ghostBtn} onClick={() => setShowTr((v) => !v)}>
          {showTr ? "Orijinali Göster" : "Türkçe Göster"}
        </button>
        <button style={ghostBtn} disabled={syncing} onClick={runSync}>
          {syncing ? "Sync…" : "Sync"}
        </button>
      </div>

      {notice && (
        <div style={{ ...card, marginBottom: 12, fontSize: 13, color: "var(--text-secondary)" }}>{notice}</div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* SOL: konuşma listesi */}
        <div style={{ width: 280, flexShrink: 0, display: "grid", gap: 6 }}>
          {loadingList ? (
            <p style={{ color: "var(--text-secondary)" }}>Yükleniyor…</p>
          ) : conversations.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              Konuşma yok. Sync çalıştırın.
            </p>
          ) : (
            conversations.map((c) => {
              const isActive = c.conversationId === activeId;
              return (
                <button
                  key={c.conversationId}
                  onClick={() => openConversation(c.conversationId)}
                  style={{
                    textAlign: "left",
                    background: isActive ? "rgba(155,44,52,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isActive ? "rgba(155,44,52,0.3)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    cursor: "pointer",
                    color: "var(--text-primary)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ fontSize: 13, flex: 1 }}>@{c.participantUsername || "?"}</strong>
                    {c.hasDrafts && (
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {fmtTime(c.lastMessageAt)}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* SAĞ: thread + taslak paneli */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!active ? (
            <p style={{ color: "var(--text-secondary)" }}>Bir konuşma seçin.</p>
          ) : (
            <>
              <div style={{ ...card, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  @{active.participantUsername || "?"}
                </div>
                {loadingThread ? (
                  <p style={{ color: "var(--text-secondary)" }}>Yükleniyor…</p>
                ) : messages.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Mesaj yok.</p>
                ) : (
                  <div style={{ display: "grid", gap: 8, maxHeight: 420, overflowY: "auto" }}>
                    {messages.map((m) => {
                      const foreign = Boolean(m.lang) && m.lang !== "tr";
                      const body = showTr && foreign && m.trText ? m.trText : m.text;
                      return (
                        <div
                          key={m.messageId}
                          style={{
                            alignSelf: m.fromMe ? "flex-end" : "flex-start",
                            maxWidth: "80%",
                            background: m.fromMe ? "rgba(155,44,52,0.12)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${m.fromMe ? "rgba(155,44,52,0.25)" : "rgba(255,255,255,0.1)"}`,
                            borderRadius: 10,
                            padding: "7px 11px",
                            fontSize: 13,
                            lineHeight: 1.5,
                          }}
                        >
                          {body}
                          {foreign && (
                            <span style={{ fontSize: 10, color: "var(--text-secondary)", marginLeft: 6 }}>
                              {m.lang.toUpperCase()}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Taslak paneli */}
              <div style={{ ...card }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 14, flex: 1 }}>Yanıt Taslağı</h4>
                  <button style={accentBtn} disabled={generating} onClick={generateDrafts}>
                    {generating ? "Üretiliyor…" : "Yanıt Taslağı Üret"}
                  </button>
                </div>

                {drafts.some((d) => d.riskWarning) && (
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
                    Dikkatli gönder: risk denetimi düşük güvenlik puanı verdi. Göndermeden önce tonu/içeriği kontrol edin.
                  </div>
                )}

                {drafts.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
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
                            <button style={miniBtn} onClick={() => copy(edits[d.id] ?? d.textTr)}>
                              Kopyala
                            </button>
                          </div>
                          {foreign && (
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                              Türkçe (referans): {d.textTr}
                            </div>
                          )}
                          <textarea
                            value={edits[d.id] ?? ""}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [d.id]: e.target.value }))}
                            style={{
                              width: "100%",
                              minHeight: 70,
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
                            <button style={accentBtn} onClick={() => draftAction(d.id, "sent")}>
                              Gönderdim
                            </button>
                            <button style={ghostBtn} onClick={() => draftAction(d.id, "edited")}>
                              Düzenledim
                            </button>
                            <button style={ghostBtn} onClick={() => draftAction(d.id, "dismissed")}>
                              Olmadı
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
