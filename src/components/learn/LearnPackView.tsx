"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Clock, AlertTriangle, GraduationCap, Download } from "lucide-react";
import { Card, SubNav, Badge, Button, Skeleton, EmptyState } from "@/components/ui";
import { categoryLabel } from "@/lib/learning/types";

type Grounding = { chunkIdx: number };
type Concept = { id: string; label: string; definition: string; importance: number; masteryScore: number; grounding: Grounding[] };
type Item = { id: string; kind: string; front: string; back: string; options: string[]; correctIdx: number | null; difficulty: number; groundingType: string; chunkIdx: number | null };
type Chunk = { idx: number; startSec: number; text: string };
type PackDetail = {
  id: string;
  status: string;
  category: string;
  masteryScore: number;
  summaryL1: string;
  summaryL2: string;
  summaryL3: string;
  qaReport: { coverage?: number; verdict?: string; flagged?: { claim: string; reason: string }[] };
  source: { title: string; channelTitle: string; url: string } | null;
  concepts: Concept[];
  items: Item[];
  chunks: Chunk[];
};

function mmss(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function LearnPackView({ packId, onBack }: { packId: string; onBack: () => void }) {
  const [pack, setPack] = useState<PackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("genel");
  const [exporting, setExporting] = useState(false);

  async function exportObsidian() {
    setExporting(true);
    try {
      const res = await fetch(`/api/learn/packs/${packId}/obsidian`);
      const json = await res.json();
      if (!json.success) return;
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const enc = new TextEncoder(); // UTF-8 byte'ları → Türkçe karakterler bozulmaz (mojibake fix)
      for (const f of json.files as { path: string; content: string }[]) zip.file(f.path, enc.encode(f.content));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${json.folderName || "ogrenme-paketi"}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/learn/packs/${packId}`);
      const json = await res.json();
      if (!cancelled) {
        setPack(json.success ? json.pack : null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packId]);

  if (loading)
    return (
      <Card variant="feature" padded>
        <Skeleton lines={6} height={16} />
      </Card>
    );
  if (!pack)
    return (
      <Card variant="feature" padded>
        <EmptyState
          icon={<AlertTriangle size={22} strokeWidth={1.8} />}
          title="Paket bulunamadı"
          description="Bu öğrenme paketi yüklenemedi."
        />
      </Card>
    );

  const chunkStart = new Map(pack.chunks.map((c) => [c.idx, c.startSec]));
  const flashcards = pack.items.filter((i) => i.kind === "flashcard");
  const quizzes = pack.items.filter((i) => i.kind === "quiz_mcq");

  const TimestampChip = ({ chunkIdx }: { chunkIdx: number | null }) => {
    if (chunkIdx === null || !chunkStart.has(chunkIdx)) return null;
    return (
      <span
        className="tnum"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: "var(--text-2xs)",
          color: "var(--accent-text)",
          border: "1px solid var(--accent-border)",
          borderRadius: "var(--radius-sm)",
          padding: "1px 6px",
        }}
      >
        <Clock size={10} strokeWidth={2} />
        {mmss(chunkStart.get(chunkIdx)!)}
      </span>
    );
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-4)" }}>
        <Button variant="ghost" size="sm" onClick={onBack} iconLeft={<ArrowLeft size={15} strokeWidth={2} />}>
          Geri
        </Button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--text-base)",
              fontWeight: 700,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {pack.source?.title || "Öğrenme Paketi"}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{pack.source?.channelTitle}</div>
        </div>
        <Badge variant="muted" size="sm">
          {categoryLabel(pack.category)}
        </Badge>
        <Badge variant="accent" size="sm">
          Mastery {pack.masteryScore}
        </Badge>
        <Button
          variant="secondary"
          size="sm"
          onClick={exportObsidian}
          disabled={exporting}
          loading={exporting}
          iconLeft={exporting ? undefined : <Download size={14} strokeWidth={2} />}
        >
          Obsidian&apos;a aktar
        </Button>
      </div>

      {pack.status !== "ready" && (
        <Card variant="quiet" padded style={{ marginBottom: "var(--space-3)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            <AlertTriangle size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2, color: "var(--danger)" }} />
            <span>
              Kalite kontrolü: <b>{pack.qaReport.verdict ?? "—"}</b> (kaynak kapsamı {Math.round((pack.qaReport.coverage ?? 0) * 100)}%). Bu
              paket henüz tam doğrulanmadı; düşük güvenli olabilir.
            </span>
          </div>
        </Card>
      )}

      <SubNav
        items={[
          { id: "genel", label: "Genel" },
          { id: "kavramlar", label: "Kavramlar", badge: pack.concepts.length },
          { id: "kartlar", label: "Kartlar", badge: flashcards.length },
          { id: "quiz", label: "Quiz", badge: quizzes.length },
          { id: "transkript", label: "Transkript" },
        ]}
        activeId={tab}
        onSelect={setTab}
      />

      {tab === "genel" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <Card variant="feature" padded>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 6 }}>
              30 SANİYE
            </div>
            <p style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--text-primary)", lineHeight: 1.5 }}>{pack.summaryL1}</p>
          </Card>
          <Card variant="default" padded>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 6 }}>
              YÖNETİCİ ÖZETİ
            </div>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {pack.summaryL2}
            </p>
          </Card>
          <Card variant="default" padded>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 6 }}>
              BÖLÜM BÖLÜM
            </div>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {pack.summaryL3}
            </p>
          </Card>
        </div>
      )}

      {tab === "kavramlar" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {pack.concepts.map((c) => (
            <Card key={c.id} variant="default" padded>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--text-primary)", flex: 1 }}>{c.label}</span>
                <Badge variant="muted" size="xs">
                  önem {c.importance}
                </Badge>
                <Badge variant={c.masteryScore >= 60 ? "accent" : "muted"} size="xs">
                  mastery {c.masteryScore}
                </Badge>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{c.definition}</p>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {c.grounding.map((g, i) => (
                  <TimestampChip key={i} chunkIdx={g.chunkIdx} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "kartlar" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {flashcards.length === 0 ? (
            <EmptyState icon={<GraduationCap size={22} strokeWidth={1.8} />} title="Kart yok" description="Bu pakette flashcard üretilmedi." compact />
          ) : (
            flashcards.map((f) => (
              <Card key={f.id} variant="default" padded>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>{f.front}</div>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 4 }}>{f.back}</div>
                  </div>
                  <TimestampChip chunkIdx={f.chunkIdx} />
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "quiz" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {quizzes.length === 0 ? (
            <EmptyState icon={<GraduationCap size={22} strokeWidth={1.8} />} title="Quiz yok" description="Bu pakette quiz üretilmedi." compact />
          ) : (
            quizzes.map((q) => (
              <Card key={q.id} variant="default" padded>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>{q.front}</div>
                  <TimestampChip chunkIdx={q.chunkIdx} />
                </div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)" }}>
                  {q.options.map((o, i) => (
                    <li
                      key={i}
                      style={{ color: i === q.correctIdx ? "var(--green)" : "var(--text-secondary)", fontWeight: i === q.correctIdx ? 600 : 400 }}
                    >
                      {o}
                    </li>
                  ))}
                </ul>
                {q.back && <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{q.back}</div>}
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "transkript" && (
        <Card variant="default" padded>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pack.chunks.map((c) => (
              <div key={c.idx} style={{ display: "flex", gap: 10, fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
                <span className="tnum" style={{ color: "var(--accent-text)", flexShrink: 0, minWidth: 44 }}>
                  {mmss(c.startSec)}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>{c.text}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
