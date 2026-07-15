"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, Library as LibraryIcon, ChevronLeft, ChevronRight, Copy, Sparkles, ExternalLink } from "lucide-react";
import { Card, Input, Select, Badge, Button, EmptyState, ErrorState, Skeleton, Drawer } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useXAgentStore } from "@/store/xagent";
import type { LibItem, LibItemType, LibCounts } from "@/lib/library/librarySearch";

/**
 * Kütüphane / Tümü (05 §D1) — 4 legacy kütüphane (viral/keyword/prompt/pattern) +
 * içerik havuzu tek aramada. Server-side sayfalı birleşik arama (/api/library/
 * search). Niş filtreler (platform) "gelişmiş" panelde — ana yüzeyi boğmaz.
 * "/" arama odağı. Item → drawer → İlham analizine köprü. Bare host.
 */

const TYPE_LABEL: Record<LibItemType, string> = {
  viral: "viral",
  keyword: "anahtar",
  prompt: "prompt",
  pattern: "pattern",
  content: "içerik",
};

const LIMIT = 24;

export default function LibTumuTab() {
  const toast = useToast();
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  const searchRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState<LibItemType | "all">("all");
  const [platform, setPlatform] = useState("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [offset, setOffset] = useState(0);

  const [items, setItems] = useState<LibItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<LibCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<LibItem | null>(null);

  // Debounce arama.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 280);
    return () => clearTimeout(id);
  }, [q]);

  // Filtre değişince başa dön.
  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, type, platform]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({
        q: debouncedQ,
        type,
        platform,
        limit: String(LIMIT),
        offset: String(offset),
      });
      const res = await fetch(`/api/library/search?${params.toString()}`);
      if (!res.ok) throw new Error("http");
      const json = await res.json();
      if (!json.success) throw new Error("payload");
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
      setCounts(json.counts ?? null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, type, platform, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // "/" arama kutusuna odaklanır (metin girişinde değilken).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const typeSegments = useMemo(() => {
    const c = counts;
    return [
      { value: "all", label: "Tümü", count: total },
      { value: "viral", label: "Viral", count: c?.viral },
      { value: "prompt", label: "Prompt", count: c?.prompt },
      { value: "pattern", label: "Pattern", count: c?.pattern },
      { value: "keyword", label: "Anahtar", count: c?.keyword },
      { value: "content", label: "İçerik", count: c?.content },
    ];
  }, [counts, total]);

  const copy = (item: LibItem) => {
    navigator.clipboard?.writeText(item.body || item.title).then(
      () => toast.success("Kopyalandı."),
      () => toast.error("Kopyalanamadı."),
    );
  };

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = offset + items.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
      {/* Arama + tür segmentleri + gelişmiş */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 200 }}>
            <Input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Kütüphanede ara…  ( / )"
              iconLeft={<Search size={15} />}
              aria-label="Kütüphane araması"
              data-testid="lib-search"
            />
          </div>
          <Button
            size="sm"
            variant={advancedOpen ? "primary" : "secondary"}
            onClick={() => setAdvancedOpen((v) => !v)}
            iconLeft={<SlidersHorizontal size={14} strokeWidth={2} />}
          >
            Gelişmiş
          </Button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {typeSegments.map((s) => {
            const active = type === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setType(s.value as LibItemType | "all")}
                aria-pressed={active}
                data-testid={`lib-type-${s.value}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 13px",
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
                {s.label}
                {typeof s.count === "number" && (
                  <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                    {s.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {advancedOpen && (
          <Card variant="quiet" padded>
            <label style={{ display: "inline-flex", flexDirection: "column", gap: 5 }}>
              <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Platform</span>
              <Select
                aria-label="Platform"
                options={[
                  { value: "all", label: "Tümü" },
                  { value: "x", label: "X" },
                  { value: "instagram", label: "Instagram" },
                  { value: "youtube", label: "YouTube" },
                ]}
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              />
            </label>
          </Card>
        )}
      </div>

      {/* Sonuçlar */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ padding: "14px 16px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
              <Skeleton lines={2} />
            </div>
          ))}
        </div>
      ) : failed ? (
        <ErrorState title="Arama yüklenemedi" description="Kütüphane araması getirilemedi. Yeniden dene." onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<LibraryIcon size={22} strokeWidth={1.8} />}
          title={debouncedQ ? "Aramaya uygun sonuç yok" : "Kütüphanede sonuç yok"}
          description="Viral örnek, prompt, pattern, anahtar kelime ya da içerik bulunamadı. İlham'dan yeni kaynak kaydedebilirsin."
          action={
            <Button variant="primary" onClick={() => setActiveTab("lib-ilham")} iconLeft={<Sparkles size={15} strokeWidth={2} />}>
              Kaynak ekle
            </Button>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => setActive(it)}
              data-testid={`lib-row-${it.type}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "13px 16px",
                textAlign: "left",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--border-strong)";
                e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--bg-surface)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Badge variant="muted" size="xs">{TYPE_LABEL[it.type]}</Badge>
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.title}
                </span>
                {it.meta && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flexShrink: 0 }}>{it.meta}</span>}
              </div>
              {it.body && (
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {it.body}
                </span>
              )}
            </button>
          ))}

          {/* Sayfalama */}
          {total > LIMIT && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
              <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                {rangeStart}–{rangeEnd} / {total}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} iconLeft={<ChevronLeft size={14} />}>
                  Önceki
                </Button>
                <Button size="sm" variant="secondary" disabled={rangeEnd >= total} onClick={() => setOffset(offset + LIMIT)} iconRight={<ChevronRight size={14} />}>
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Item drawer */}
      <Drawer open={!!active} onClose={() => setActive(null)} title={active ? `${TYPE_LABEL[active.type]} · ${active.title}` : ""} width={560}>
        {active && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge variant="accent" size="sm">{TYPE_LABEL[active.type]}</Badge>
              {active.platform && <Badge variant="muted" size="sm">{active.platform}</Badge>}
              {active.meta && <Badge variant="muted" size="sm">{active.meta}</Badge>}
            </div>
            <div
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--text-primary)",
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                fontFamily: active.type === "prompt" ? "var(--font-mono)" : "inherit",
                background: active.type === "prompt" ? "var(--bg-sunken)" : "transparent",
                padding: active.type === "prompt" ? "12px 14px" : 0,
                borderRadius: active.type === "prompt" ? "var(--radius-md)" : 0,
                border: active.type === "prompt" ? "1px solid var(--border-faint)" : "none",
              }}
            >
              {active.body || active.title}
            </div>
            {active.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {active.tags.map((t, i) => (
                  <Badge key={`${t}-${i}`} variant="muted" size="xs">{t}</Badge>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--border-faint)" }}>
              <Button size="sm" variant="secondary" onClick={() => copy(active)} iconLeft={<Copy size={14} strokeWidth={2} />}>
                Kopyala
              </Button>
              {active.sourceUrl && (
                <a href={active.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <Button size="sm" variant="ghost" iconRight={<ExternalLink size={13} strokeWidth={2} />}>Kaynağı aç</Button>
                </a>
              )}
              {active.canAnalyze && (
                <Button size="sm" variant="primary" onClick={() => { setActiveTab("lib-ilham"); toast.info("İlham açıldı — bu içeriği analiz et."); }} iconLeft={<Sparkles size={14} strokeWidth={2} />}>
                  İlham'da analiz et
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
