"use client";

import { useEffect, useState, useCallback } from "react";

// İçerik Zekası (Content Intelligence) sekmesi — Eden döngüsünün görünür yüzü.
// Üç alt-görünüm: Keşif (semantik arama + outlier'lar), Boards, Fikirler.
// Yeni /api/content, /api/content/search, /api/content/outliers, /api/boards,
// /api/ideas uçlarına bağlanır. Salt-okuma listeleri; yazma aksiyonları mevcut
// route'lar üzerinden (operator-guard) yapılır.

type SubView = "discover" | "boards" | "ideas";

type ContentItem = {
  id: string;
  platform: string;
  format: string;
  title: string;
  body: string;
  author: string;
  canonicalUrl: string | null;
};
type OutlierRow = {
  id: string;
  multiplier: number;
  metricValue: number;
  baselineMedian: number;
  contentItem?: ContentItem;
  explanation?: Record<string, unknown>;
};
type BoardRow = { id: string; name: string; description: string };
type IdeaRow = { id: string; title: string; angle: string; hook: string; status: string; platform: string };

const SUBVIEWS: { id: SubView; label: string }[] = [
  { id: "discover", label: "Keşif" },
  { id: "boards", label: "Boards" },
  { id: "ideas", label: "Fikirler" },
];

const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)]";
const chip = "rounded-full bg-[#C8E0BF]/15 px-2.5 py-0.5 text-xs text-[#C8E0BF]";

export default function ContentIntelligenceTab() {
  const [view, setView] = useState<SubView>("discover");

  return (
    <div className="space-y-5 p-1 text-neutral-200">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight">İçerik Zekası</h1>
        <p className="text-sm text-neutral-400">
          Kanonik içerik · creator-relative outlier · semantik keşif · boards · fikirler
        </p>
      </header>

      <nav className="flex gap-1.5">
        {SUBVIEWS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setView(s.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              view === s.id ? "bg-[#C8E0BF] text-neutral-900" : "bg-white/5 text-neutral-300 hover:bg-white/10"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {view === "discover" && <DiscoverView />}
      {view === "boards" && <BoardsView />}
      {view === "ideas" && <IdeasView />}
    </div>
  );
}

function useJson<T>(url: string | null): { data: T | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null,
    loading: !!url,
    error: null,
  });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => setState({ data: j, loading: false, error: j?.success === false ? j.error : null }))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : "Hata" });
      });
    return () => controller.abort();
  }, [url]);
  return state;
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-neutral-500">{text}</p>;
}

function DiscoverView() {
  const [query, setQuery] = useState("");
  const [searchUrl, setSearchUrl] = useState<string | null>(null);
  const outliers = useJson<{ items: OutlierRow[] }>("/api/content/outliers?limit=20");
  const recent = useJson<{ count: number; items: ContentItem[] }>("/api/content?limit=30");
  const search = useJson<{ results: { score: number; item: ContentItem }[] }>(searchUrl);

  const runSearch = useCallback(() => {
    const q = query.trim();
    setSearchUrl(q ? `/api/content/search?q=${encodeURIComponent(q)}&limit=20` : null);
  }, [query]);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Semantik ara: konu, ton, format…"
          className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-[#C8E0BF]/40"
        />
        <button
          type="button"
          onClick={runSearch}
          className="rounded-full bg-[#C8E0BF] px-5 py-2 text-sm text-neutral-900 hover:bg-[#b9d6ae]"
        >
          Ara
        </button>
      </div>

      {searchUrl && (
        <section className="space-y-2">
          <h2 className="text-sm text-neutral-400">Arama sonuçları</h2>
          {search.loading && <Empty text="Aranıyor…" />}
          {search.error && <Empty text={search.error} />}
          {search.data && search.data.results?.length === 0 && (
            <Empty text="Sonuç yok — önce içerik indexle (POST /api/content/search?action=reindex)." />
          )}
          <div className="grid gap-2">
            {search.data?.results?.map(({ score, item }) => (
              <article key={item.id} className={card}>
                <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
                  <span className={chip}>{item.platform}</span>
                  {item.format && <span className="text-neutral-500">{item.format}</span>}
                  <span className="ml-auto tabular-nums text-[#C8E0BF]">{score.toFixed(3)}</span>
                </div>
                <p className="line-clamp-3 text-sm text-neutral-200">{item.title || item.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm text-neutral-400">Outlier&apos;lar (creator-relative)</h2>
        {outliers.loading && <Empty text="Yükleniyor…" />}
        {outliers.error && <Empty text={outliers.error} />}
        {outliers.data && outliers.data.items.length === 0 && (
          <Empty text="Henüz outlier yok — kaynaklarda gerçek beğeni/RT verisi + creator başına ≥3 gönderi birikince dolar." />
        )}
        <div className="grid gap-2">
          {outliers.data?.items.map((o) => (
            <article key={o.id} className={card}>
              <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
                {o.contentItem && <span className={chip}>{o.contentItem.platform}</span>}
                <span className="ml-auto tabular-nums text-[#C8E0BF]">{o.multiplier.toFixed(2)}×</span>
              </div>
              <p className="line-clamp-2 text-sm text-neutral-200">
                {o.contentItem?.title || o.contentItem?.body || "—"}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {Math.round(o.metricValue)} vs medyan {Math.round(o.baselineMedian)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm text-neutral-400">
          Son içerikler{recent.data?.count ? ` (${recent.data.count})` : ""}
        </h2>
        {recent.loading && <Empty text="Yükleniyor…" />}
        {recent.error && <Empty text={recent.error} />}
        {recent.data && recent.data.items.length === 0 && (
          <Empty text="Havuz boş — günlük cron veya POST /api/content/sync içerik besler." />
        )}
        <div className="grid gap-2">
          {recent.data?.items.map((it) => (
            <article key={it.id} className={card}>
              <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
                <span className={chip}>{it.platform}</span>
                {it.format && <span className="text-neutral-500">{it.format}</span>}
                {it.author && <span className="ml-auto text-neutral-500">{it.author}</span>}
              </div>
              <p className="line-clamp-2 text-sm text-neutral-200">{it.title || it.body || "—"}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function BoardsView() {
  const { data, loading, error } = useJson<{ boards: BoardRow[] }>("/api/boards");
  if (loading) return <Empty text="Yükleniyor…" />;
  if (error) return <Empty text={error} />;
  if (!data?.boards.length) return <Empty text="Henüz board yok. (POST /api/boards ile oluştur)" />;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {data.boards.map((b) => (
        <article key={b.id} className={card}>
          <h3 className="text-sm font-medium text-neutral-100">{b.name}</h3>
          {b.description && <p className="mt-1 text-xs text-neutral-400">{b.description}</p>}
        </article>
      ))}
    </div>
  );
}

function IdeasView() {
  const { data, loading, error } = useJson<{ ideas: IdeaRow[] }>("/api/ideas?limit=50");
  if (loading) return <Empty text="Yükleniyor…" />;
  if (error) return <Empty text={error} />;
  if (!data?.ideas.length) return <Empty text="Henüz fikir yok. Reverse-Engineer bir içerikten fikir üretir." />;
  return (
    <div className="grid gap-2">
      {data.ideas.map((i) => (
        <article key={i.id} className={card}>
          <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
            <span className={chip}>{i.platform}</span>
            <span className="text-neutral-500">{i.status}</span>
          </div>
          <p className="text-sm text-neutral-100">{i.hook || i.title}</p>
          {i.angle && <p className="mt-1 text-xs text-neutral-400">{i.angle}</p>}
        </article>
      ))}
    </div>
  );
}
