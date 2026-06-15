"use client";

import { useState, useEffect } from "react";
import { GitBranch, Star, Copy } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { Card, EmptyState, SectionHeader, Skeleton, Badge, Button } from "@/components/ui";

type RepoItem = {
  id: string;
  repoName: string;
  owner: string;
  repoUrl: string;
  stars: number;
  language: string | null;
  descriptionTr: string;
  whyItMatters: string;
  tweetHook: string;
  xValueScore: number;
  bestFor: string | null;
};

type RepoResponse = { success: boolean; items?: RepoItem[]; error?: string };

type Props = {
  onToast: (text: string, type: "success" | "error") => void;
};

export default function RepoHighlights({ onToast }: Props) {
  const [items, setItems] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchJson<RepoResponse>("/api/repo-radar?limit=3")
      .then((data) => {
        if (mounted && data.success && data.items) setItems(data.items.slice(0, 3));
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCopy = async (hook: string) => {
    const ok = await copyToClipboard(hook);
    onToast(ok ? "Tweet hook kopyalandı." : "Kopyalama başarısız.", ok ? "success" : "error");
  };

  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      <SectionHeader eyebrow="KEŞIF" title="Repo Öne Çıkanlar" />

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Card key={i} variant="feature">
              <Skeleton lines={2} height={13} />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card variant="feature" padded={false}>
          <EmptyState
            icon={<GitBranch size={22} strokeWidth={1.8} />}
            title="Repo radar verisi bulunamadı"
            description="Repo Radar sekmesinden tarama çalıştırın; trend repolar burada öne çıkar."
          />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((r) => (
            <Card key={r.id} variant="feature">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <a
                  href={r.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display"
                  style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", textDecoration: "none", letterSpacing: "-0.01em" }}
                >
                  {r.owner}/{r.repoName}
                </a>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="tnum" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--yellow)" }}>
                    <Star size={13} strokeWidth={1.8} fill="currentColor" />
                    {r.stars.toLocaleString("tr-TR")}
                  </span>
                  {r.language && (
                    <Badge variant="blue" size="sm">{r.language}</Badge>
                  )}
                  <Badge variant="accent" size="sm">
                    <span className="tnum">{r.xValueScore}</span>
                  </Badge>
                </div>
              </div>
              {r.tweetHook && (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {r.tweetHook}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Copy size={14} strokeWidth={1.8} />}
                  onClick={() => handleCopy(r.tweetHook || `${r.owner}/${r.repoName} ${r.repoUrl}`)}
                >
                  Kopyala
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
