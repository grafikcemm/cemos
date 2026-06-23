"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Library, Search, Copy, X, Tag, FileText } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { PageHeader, Card, EmptyState, Skeleton, Badge, useToast } from "../ui";

type Prompt = {
  id: string;
  slug: string;
  title: string;
  category: string;
  useCase: string | null;
  promptText: string;
  lang: string;
  tags: string[];
  source: string;
};

type Response = { success: boolean; items?: Prompt[]; error?: string };

export default function PromptKutuphanesiTab() {
  const [items, setItems] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Prompt | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<Response>("/api/prompt-library?limit=300");
      if (data.success && data.items) setItems(data.items);
    } catch {
      // empty state handles it
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => p.category && set.add(p.category));
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const filtered = items.filter((p) => {
    if (category !== "all" && p.category !== category) return false;
    if (search) {
      const s = search.toLocaleLowerCase("tr-TR");
      const hay = [p.title, p.promptText, p.useCase, ...p.tags].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Prompt kopyalandı.");
    else toast.error("Kopyalama başarısız.");
  };

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      <PageHeader
        eyebrow="KÜTÜPHANE"
        title="Prompt Kütüphanesi"
        subtitle="Kategorilere ayrılmış prompt arşivi — ara, gözden geçir, tek tıkla kopyala."
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Library size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
              <span className="tnum" style={{ color: "var(--text-primary)", fontWeight: 500 }}>{filtered.length}</span>
              <span>prompt</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Tag size={15} strokeWidth={1.8} style={{ color: "var(--blue)" }} />
              <span className="tnum" style={{ color: "var(--text-primary)", fontWeight: 500 }}>{Math.max(0, categories.length - 1)}</span>
              <span>kategori</span>
            </span>
          </>
        }
      />

      <Card variant="quiet" padded={false} style={{ marginBottom: "var(--space-4)" }}>
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", padding: "8px 12px", fontSize: "var(--text-sm)", outline: "none", cursor: "pointer", transition: "border-color var(--ease-out) 150ms" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c === "all" ? "Tümü" : c}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 }}>
            <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Arama</label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={15} strokeWidth={1.8} style={{ position: "absolute", left: 12, color: "var(--text-muted)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder="Prompt ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", padding: "8px 12px 8px 34px", fontSize: "var(--text-sm)", outline: "none", transition: "border-color var(--ease-out) 150ms" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={148} style={{ borderRadius: "var(--radius-xl)" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card variant="quiet">
          <EmptyState
            icon={<Library size={24} strokeWidth={1.8} />}
            title="Prompt bulunamadı"
            description={search || category !== "all" ? "Filtre kriterlerine uyan prompt yok. Aramayı temizleyip yeniden deneyin." : "Henüz kütüphanede prompt yok."}
            action={
              (search || category !== "all") && (
                <button
                  onClick={() => { setSearch(""); setCategory("all"); }}
                  style={{ padding: "8px 16px", background: "var(--gradient-accent), var(--bg-elevated)", border: "1px solid var(--accent-border)", color: "var(--accent-text)", borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)", fontWeight: 500, cursor: "pointer" }}
                >
                  Filtreyi temizle
                </button>
              )
            }
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
          {filtered.map((p) => (
            <Card
              key={p.id}
              interactive
              onClick={() => setSelected(p)}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span className="font-display" style={{ fontSize: "var(--text-md)", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{p.title}</span>
                <Badge variant="muted" size="sm">{p.category}</Badge>
              </div>
              {p.useCase && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.45 }}>{p.useCase}</div>}
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", lineHeight: 1.55, maxHeight: 64, overflow: "hidden" }}>
                {p.promptText.slice(0, 140)}{p.promptText.length > 140 ? "..." : ""}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopy(p.promptText); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)", fontWeight: 500, cursor: "pointer", alignSelf: "flex-start", marginTop: "auto", transition: "border-color var(--ease-out) 150ms, color var(--ease-out) 150ms" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent-text)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                <Copy size={15} strokeWidth={1.8} />
                Kopyala
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Modal preview */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg-base) 78%, transparent)", backdropFilter: "blur(2px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--gradient-surface), var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-2xl)", padding: 24, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--shadow-lg), var(--highlight-top)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: 8 }}>{selected.category}</div>
                <h2 className="font-display" style={{ fontSize: "var(--text-xl)", fontWeight: 500, margin: "0 0 8px 0", color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{selected.title}</h2>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge variant="muted" size="sm">{selected.lang}</Badge>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>· {selected.source}</span>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Kapat"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, flexShrink: 0, background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", cursor: "pointer", transition: "background var(--ease-out) 150ms, color var(--ease-out) 150ms, border-color var(--ease-out) 150ms" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            {selected.useCase && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>{selected.useCase}</div>}
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
              <FileText size={14} strokeWidth={1.8} />
              Prompt metni
            </div>
            <pre style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 14, margin: 0, fontFamily: "inherit" }}>
              {selected.promptText}
            </pre>
            {selected.tags.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                {selected.tags.map((t) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-xs)", color: "var(--text-muted)", background: "var(--bg-base)", border: "1px solid var(--border)", padding: "3px 9px", borderRadius: "var(--radius-xl)" }}>
                    <Tag size={12} strokeWidth={1.8} />
                    {t}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => handleCopy(selected.promptText)}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 18, padding: "10px 18px", background: "var(--gradient-accent), var(--bg-elevated)", border: "1px solid var(--accent-border)", color: "var(--accent-text)", borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)", fontWeight: 500, cursor: "pointer", boxShadow: "var(--highlight-top)", transition: "box-shadow var(--ease-out) 150ms" }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-accent), var(--highlight-top)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--highlight-top)"; }}
            >
              <Copy size={16} strokeWidth={1.8} />
              Prompt&apos;u Kopyala
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
