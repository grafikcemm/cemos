"use client";

import { useState, useEffect, useCallback } from "react";
import { Radar, Search, RefreshCw, Star, Lightbulb, Copy, GitBranch } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { PageHeader, Card, Button, Input, Badge, EmptyState, Skeleton } from "../ui";
import { useToast } from "../ui/Toast";

type RepoItem = {
  id: string;
  repoName: string;
  owner: string;
  repoUrl: string;
  stars: number;
  language: string | null;
  topics: string[];
  descriptionTr: string;
  whyItMatters: string;
  tweetHook: string;
  xValueScore: number;
  bestFor: string | null;
};

type Response = { success: boolean; items?: RepoItem[]; error?: string };

const scoreColor = (s: number) => (s >= 75 ? "var(--accent-text)" : s >= 50 ? "var(--yellow)" : "var(--danger)");

export default function RepoRadarTab() {
  const [items, setItems] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<Response>("/api/repo-radar?limit=100");
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

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Tweet hook kopyalandı.");
    else toast.error("Kopyalama başarısız.");
  };

  const filtered = items.filter((r) => {
    if (!search) return true;
    const s = search.toLocaleLowerCase("tr-TR");
    return [r.repoName, r.owner, r.descriptionTr, r.language]
      .filter(Boolean)
      .some((v) => (v as string).toLocaleLowerCase("tr-TR").includes(s));
  });

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      <PageHeader
        eyebrow="KEŞFET"
        title="Repo Radarı"
        subtitle="GitHub trendlerini tarayıp X değerine göre puanlanmış, tweet'e hazır kancalarla sunar."
        actions={
          <Button variant="secondary" iconLeft={<RefreshCw size={15} strokeWidth={1.9} />} onClick={load}>
            Yenile
          </Button>
        }
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Radar size={15} strokeWidth={1.9} style={{ color: "var(--accent-text)" }} />
              <span className="tnum" style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                {filtered.length}
              </span>
              trend repo
            </span>
            {search && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)" }}>
                <Search size={14} strokeWidth={1.9} />
                "{search}" filtreli
              </span>
            )}
          </>
        }
      />

      <div style={{ marginBottom: "var(--space-5)" }}>
        <Input
          type="text"
          placeholder="Repo, sahip veya açıklama ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          iconLeft={<Search size={15} strokeWidth={1.9} />}
        />
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "var(--space-3)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} variant="default">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Skeleton width="60%" height={16} />
                <Skeleton width="40%" height={11} />
                <Skeleton width="100%" height={32} />
                <Skeleton width="50%" height={24} />
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card variant="feature">
          <EmptyState
            icon={<Radar size={26} strokeWidth={1.8} />}
            title={search ? "Eşleşen repo yok" : "Radar henüz boş"}
            description={
              search
                ? "Aramanı genişlet ya da filtreyi temizleyip tüm trend repoları gör."
                : "Henüz taranmış trend repo yok. Radarı çalıştırarak GitHub trendlerini çek."
            }
            action={
              <Button variant="primary" iconLeft={<RefreshCw size={15} strokeWidth={1.9} />} onClick={load}>
                Radarı çalıştır
              </Button>
            }
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "var(--space-3)" }}>
          {filtered.map((r) => (
            <Card key={r.id} variant="default" interactive style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <a
                  href={r.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: "var(--text-md)",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.25,
                    minWidth: 0,
                  }}
                >
                  <GitBranch size={15} strokeWidth={1.9} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.owner}/{r.repoName}
                  </span>
                </a>
                <div
                  className="tnum"
                  title="X değer puanı"
                  style={{
                    flexShrink: 0,
                    fontSize: "var(--text-md)",
                    fontWeight: 800,
                    fontFamily: "var(--font-display)",
                    color: scoreColor(r.xValueScore),
                    lineHeight: 1,
                  }}
                >
                  {r.xValueScore}
                  <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", fontWeight: 600 }}>/100</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, fontSize: "var(--text-2xs)", color: "var(--text-muted)", alignItems: "center", flexWrap: "wrap" }}>
                <span className="tnum" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--yellow)", fontWeight: 600 }}>
                  <Star size={13} strokeWidth={2} fill="var(--yellow)" /> {r.stars.toLocaleString("tr-TR")}
                </span>
                {r.language && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--blue)" }} />
                    {r.language}
                  </span>
                )}
                {r.bestFor && <span style={{ color: "var(--text-secondary)" }}>· {r.bestFor}</span>}
              </div>

              {r.descriptionTr && (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{r.descriptionTr}</div>
              )}
              {r.whyItMatters && (
                <div style={{ display: "flex", gap: 7, fontSize: "var(--text-sm)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  <Lightbulb size={15} strokeWidth={1.9} style={{ color: "var(--yellow)", flexShrink: 0, marginTop: 1 }} />
                  <span>{r.whyItMatters}</span>
                </div>
              )}

              {r.tweetHook && (
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--text-primary)",
                    lineHeight: 1.55,
                    background: "var(--bg-base)",
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    borderLeft: "2px solid var(--accent-border)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {r.tweetHook}
                </div>
              )}

              {r.topics.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {r.topics.slice(0, 5).map((t) => (
                    <Badge key={t} variant="muted" size="xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}

              <div style={{ marginTop: "auto", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Copy size={14} strokeWidth={1.9} />}
                  onClick={() => handleCopy(r.tweetHook || `${r.owner}/${r.repoName} ${r.repoUrl}`)}
                >
                  Hook Kopyala
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
