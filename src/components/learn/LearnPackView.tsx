"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Clock, AlertTriangle, GraduationCap, Download, Copy, FileText, Info } from "lucide-react";
import { Card, SubNav, Badge, Button, Skeleton, EmptyState } from "@/components/ui";
import { categoryLabel } from "@/lib/learning/types";

type Grounding = { chunkIdx: number };
type Concept = { id: string; label: string; definition: string; importance: number; masteryScore: number; grounding: Grounding[] };
type Item = { id: string; kind: string; front: string; back: string; options: string[]; correctIdx: number | null; difficulty: number; groundingType: string; chunkIdx: number | null };
type Chunk = { idx: number; startSec: number; text: string };
type AtomicNote = { id: string; title: string; body: string; tags: string[]; chunkIdxs: number[]; groundingType: string; relatedConceptLabels: string[] };
type GraphNode = { id: string; label: string; kind: string };
type GraphEdge = { source: string; target: string; relation: string; groundingType: string };
type Task = { id: string; title: string; why: string; steps: string[]; chunkIdxs: number[]; groundingType: string; status: string };
type Idea = { id: string; title: string; angle: string; hook: string; format: string; sourceConceptLabels: string[]; groundingType: string };
type PackDetail = {
  id: string;
  status: string;
  category: string;
  masteryScore: number;
  summaryL1: string;
  summaryL2: string;
  summaryL3: string;
  pipelineVersion: string;
  sourceBasis: "transcript" | "summary";
  provider: string | null;
  hasTimestamps: boolean;
  hasArtifact: boolean;
  qaReport: { coverage?: number; verdict?: string; flagged?: { claim: string; reason: string }[] };
  source: { kind: string; title: string; channelTitle: string; url: string } | null;
  concepts: Concept[];
  items: Item[];
  chunks: Chunk[];
  atomicNotes: AtomicNote[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  graphMermaid: string;
  tasks: Task[];
  contentIdeas: Idea[];
};

function mmss(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const GROUNDING_LABEL: Record<string, string> = {
  source_supported: "transkript",
  summary_supported: "özet",
  external_context: "dış bağlam",
  inference: "çıkarım",
  uncertain: "belirsiz",
};

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
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
      const enc = new TextEncoder();
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
        <EmptyState icon={<AlertTriangle size={22} strokeWidth={1.8} />} title="Paket bulunamadı" description="Bu öğrenme paketi yüklenemedi." />
      </Card>
    );

  const isReady = pack.status === "ready";
  const isSummary = pack.sourceBasis === "summary";
  const chunkStart = new Map(pack.chunks.map((c) => [c.idx, c.startSec]));
  const flashcards = pack.items.filter((i) => i.kind === "flashcard");
  const quizzes = pack.items.filter((i) => i.kind === "quiz_mcq");
  const nodeLabel = new Map(pack.graph.nodes.map((n) => [n.id, n.label]));

  // Zaman damgası YALNIZ gerçek zaman-kodlu kaynakta (hasTimestamps). Manuel/NotebookLM → chunk rozeti (zaman yok).
  const GroundChip = ({ chunkIdx }: { chunkIdx: number | null }) => {
    if (chunkIdx === null) return null;
    if (pack.hasTimestamps && chunkStart.has(chunkIdx)) {
      return (
        <span className="tnum" style={chipStyle}>
          <Clock size={10} strokeWidth={2} />
          {mmss(chunkStart.get(chunkIdx)!)}
        </span>
      );
    }
    return (
      <span style={chipStyle}>
        <FileText size={10} strokeWidth={2} />
        {isSummary ? "özet" : "kaynak"} #{chunkIdx}
      </span>
    );
  };

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: "var(--text-2xs)",
    color: "var(--accent-text)",
    border: "1px solid var(--accent-border)",
    borderRadius: "var(--radius-sm)",
    padding: "1px 6px",
  };

  const subNavItems = [
    { id: "genel", label: "Genel" },
    { id: "notlar", label: "Atomik notlar", badge: pack.atomicNotes.length },
    { id: "kavramlar", label: "Kavramlar", badge: pack.concepts.length },
    { id: "harita", label: "Zihin haritası", badge: pack.graph.edges.length },
    { id: "uygula", label: "Uygula", badge: pack.tasks.length + pack.contentIdeas.length },
    { id: "kartlar", label: "Kartlar / Quiz", badge: flashcards.length + quizzes.length },
    { id: "kaynak", label: "Kaynak" },
  ];

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <Button variant="ghost" size="sm" onClick={onBack} iconLeft={<ArrowLeft size={15} strokeWidth={2} />}>
          Geri
        </Button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-base)", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pack.source?.title || "Öğrenme Paketi"}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{pack.source?.channelTitle || (isSummary ? "NotebookLM özeti" : "Manuel transkript")}</div>
        </div>
        <Badge variant="muted" size="sm">{categoryLabel(pack.category)}</Badge>
        <Badge variant="accent" size="sm">Mastery {pack.masteryScore}</Badge>
        {/* Obsidian aktarımı YALNIZ hazır pakette (not-ready → gizli) */}
        {isReady && (
          <Button variant="secondary" size="sm" onClick={exportObsidian} disabled={exporting} loading={exporting} iconLeft={exporting ? undefined : <Download size={14} strokeWidth={2} />}>
            Obsidian&apos;a aktar
          </Button>
        )}
      </div>

      {/* NotebookLM özeti temeli — kalıcı dürüstlük uyarısı */}
      {isSummary && (
        <Card variant="quiet" padded style={{ marginBottom: "var(--space-3)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            <Info size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2, color: "var(--accent-text)" }} />
            <span>
              Bu paket bir <b>NotebookLM özetine</b> dayanıyor — orijinal videonun doğrulanmış transkripti değildir. İddialar &quot;özet temelli&quot; işaretlidir.
            </span>
          </div>
        </Card>
      )}

      {/* QA hazır değil uyarısı */}
      {!isReady && (
        <Card variant="quiet" padded style={{ marginBottom: "var(--space-3)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            <AlertTriangle size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2, color: "var(--danger)" }} />
            <span>
              Kalite kontrolü: <b>{pack.qaReport.verdict ?? "—"}</b> (kaynak kapsamı {Math.round((pack.qaReport.coverage ?? 0) * 100)}%). Bu paket henüz <b>hazır bilgi değil</b>; inceleme gerekli. Tekrar programı ve Obsidian aktarımı kapalı.
            </span>
          </div>
        </Card>
      )}

      <SubNav items={subNavItems} activeId={tab} onSelect={setTab} />

      {tab === "genel" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <Card variant="feature" padded>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 6 }}>30 SANİYE</div>
            <p style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--text-primary)", lineHeight: 1.5 }}>{pack.summaryL1 || "—"}</p>
          </Card>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge variant="muted" size="xs">temel: {isSummary ? "NotebookLM özeti" : "transkript"}</Badge>
            <Badge variant="muted" size="xs">pipeline {pack.pipelineVersion || "v1"}</Badge>
            <Badge variant="muted" size="xs">QA {pack.qaReport.verdict ?? "—"}</Badge>
            <Badge variant="muted" size="xs">kapsam {Math.round((pack.qaReport.coverage ?? 0) * 100)}%</Badge>
            {!pack.hasArtifact && <Badge variant="muted" size="xs">legacy paket (v2 artifact yok)</Badge>}
          </div>
          <Card variant="default" padded>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 6 }}>YÖNETİCİ ÖZETİ</div>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{pack.summaryL2 || "—"}</p>
          </Card>
          <Card variant="default" padded>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 6 }}>BÖLÜM BÖLÜM</div>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{pack.summaryL3 || "—"}</p>
          </Card>
        </div>
      )}

      {tab === "notlar" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {pack.atomicNotes.length === 0 ? (
            <EmptyState icon={<FileText size={22} strokeWidth={1.8} />} title="Atomik not yok" description={pack.hasArtifact ? "Bu pakette atomik not üretilmedi." : "Legacy (v1) paket — atomik notlar v2'de üretiliyor."} compact />
          ) : (
            pack.atomicNotes.map((n) => (
              <Card key={n.id} variant="default" padded data-testid="atomic-note">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, fontSize: "var(--text-sm)", color: "var(--text-primary)", flex: 1 }}>{n.title}</span>
                  <Badge variant="muted" size="xs">{GROUNDING_LABEL[n.groundingType] ?? n.groundingType}</Badge>
                </div>
                <p style={{ margin: "0 0 8px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>{n.body}</p>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  {n.chunkIdxs.map((ci, i) => (
                    <GroundChip key={i} chunkIdx={ci} />
                  ))}
                  {n.relatedConceptLabels.map((l, i) => (
                    <Badge key={`c${i}`} variant="muted" size="xs">{l}</Badge>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "kavramlar" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {pack.concepts.length === 0 ? (
            <EmptyState icon={<GraduationCap size={22} strokeWidth={1.8} />} title="Kavram yok" description="Bu pakette kavram üretilmedi." compact />
          ) : (
            pack.concepts.map((c) => (
              <Card key={c.id} variant="default" padded>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, fontSize: "var(--text-sm)", color: "var(--text-primary)", flex: 1 }}>{c.label}</span>
                  <Badge variant="muted" size="xs">önem {c.importance}</Badge>
                  <Badge variant={c.masteryScore >= 60 ? "accent" : "muted"} size="xs">mastery {c.masteryScore}</Badge>
                </div>
                <p style={{ margin: "0 0 6px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{c.definition}</p>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {c.grounding.map((g, i) => (
                    <GroundChip key={i} chunkIdx={g.chunkIdx} />
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "harita" && <MindMap nodes={pack.graph.nodes} edges={pack.graph.edges} nodeLabel={nodeLabel} mermaid={pack.graphMermaid} hasArtifact={pack.hasArtifact} />}

      {tab === "uygula" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>UYGULAMA GÖREVLERİ</div>
            {pack.tasks.length === 0 ? (
              <EmptyState icon={<GraduationCap size={20} strokeWidth={1.8} />} title="Görev yok" description={pack.hasArtifact ? "Görev üretilmedi." : "Legacy paket."} compact />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pack.tasks.map((t) => (
                  <Card key={t.id} variant="default" padded data-testid="apply-task">
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>{t.title}</div>
                        {t.why && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>{t.why}</div>}
                        {t.steps.length > 0 && (
                          <ol style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                            {t.steps.map((s, i) => (
                              <li key={i} style={{ lineHeight: 1.5 }}>{s}</li>
                            ))}
                          </ol>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => copyText(`${t.title}\n${t.why}\n- ${t.steps.join("\n- ")}`)} iconLeft={<Copy size={13} strokeWidth={2} />}>
                        Kopyala
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>İÇERİK FİKİRLERİ</div>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginBottom: 8 }}>
              Bunlar öneridir — CemOS&apos;un yayınladığı içerik değildir. Plan/Fikir&apos;e terfi ayrı, elle bir adımdır.
            </div>
            {pack.contentIdeas.length === 0 ? (
              <EmptyState icon={<GraduationCap size={20} strokeWidth={1.8} />} title="Fikir yok" description={pack.hasArtifact ? "İçerik fikri üretilmedi." : "Legacy paket."} compact />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pack.contentIdeas.map((c) => (
                  <Card key={c.id} variant="default" padded data-testid="content-idea">
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>{c.title}</span>
                          {c.format && <Badge variant="muted" size="xs">{c.format}</Badge>}
                        </div>
                        {c.hook && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 3, fontStyle: "italic" }}>&ldquo;{c.hook}&rdquo;</div>}
                        {c.angle && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>{c.angle}</div>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => copyText(`${c.title}\n${c.hook}\n${c.angle}`)} iconLeft={<Copy size={13} strokeWidth={2} />}>
                        Kopyala
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "kartlar" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div className="eyebrow" style={{ color: "var(--text-muted)" }}>FLASHCARD ({flashcards.length})</div>
            {flashcards.length === 0 ? (
              <EmptyState icon={<GraduationCap size={20} strokeWidth={1.8} />} title="Kart yok" description="Bu pakette flashcard üretilmedi." compact />
            ) : (
              flashcards.map((f) => (
                <Card key={f.id} variant="default" padded>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>{f.front}</div>
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 4 }}>{f.back}</div>
                    </div>
                    <GroundChip chunkIdx={f.chunkIdx} />
                  </div>
                </Card>
              ))
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div className="eyebrow" style={{ color: "var(--text-muted)" }}>QUIZ ({quizzes.length})</div>
            {quizzes.map((q) => (
              <Card key={q.id} variant="default" padded>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>{q.front}</div>
                  <GroundChip chunkIdx={q.chunkIdx} />
                </div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)" }}>
                  {q.options.map((o, i) => (
                    <li key={i} style={{ color: i === q.correctIdx ? "var(--green)" : "var(--text-secondary)", fontWeight: i === q.correctIdx ? 500 : 400 }}>{o}</li>
                  ))}
                </ul>
                {q.back && <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{q.back}</div>}
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === "kaynak" && (
        <Card variant="default" padded>
          {!pack.hasTimestamps && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 10, display: "flex", gap: 6, alignItems: "center" }}>
              <Info size={13} strokeWidth={2} />
              {isSummary ? "NotebookLM özeti — operatör girdisi, zaman damgası yok." : "Manuel transkript — zaman damgası yok."}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pack.chunks.map((c) => (
              <div key={c.idx} style={{ display: "flex", gap: 10, fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
                <span className="tnum" style={{ color: "var(--accent-text)", flexShrink: 0, minWidth: 44 }}>
                  {pack.hasTimestamps ? mmss(c.startSec) : `#${c.idx}`}
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

/** Zihin haritası: typed graph → erişilebilir ilişkisel görünüm (birincil) + Mermaid kodu (opsiyonel). */
function MindMap({
  nodes,
  edges,
  nodeLabel,
  mermaid,
  hasArtifact,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeLabel: Map<string, string>;
  mermaid: string;
  hasArtifact: boolean;
}) {
  if (edges.length === 0) {
    return <EmptyState icon={<GraduationCap size={22} strokeWidth={1.8} />} title="İlişki yok" description={hasArtifact ? "Kavramlar arasında ilişki kurulmadı." : "Legacy (v1) paket — zihin haritası v2'de üretiliyor."} compact />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <Card variant="default" padded>
        <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>
          İLİŞKİLER ({nodes.length} düğüm, {edges.length} bağ)
        </div>
        {/* Erişilebilir ilişkisel görünüm: klavye/ekran-okuyucu dostu liste */}
        <ul aria-label="Kavram ilişkileri" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {edges.map((e, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
              <span style={{ fontWeight: 500, color: "var(--text-primary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "3px 9px" }}>
                {nodeLabel.get(e.source) ?? e.source}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent-text)", fontSize: "var(--text-xs)" }}>
                —{e.relation}→
              </span>
              <span style={{ fontWeight: 500, color: "var(--text-primary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "3px 9px" }}>
                {nodeLabel.get(e.target) ?? e.target}
              </span>
              <Badge variant="muted" size="xs">{GROUNDING_LABEL[e.groundingType] ?? e.groundingType}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      {mermaid && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Mermaid kodu (harici diyagram için)</summary>
          <pre style={{ marginTop: 8, padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", fontSize: "var(--text-2xs)", color: "var(--text-secondary)", overflowX: "auto", whiteSpace: "pre" }}>
            {mermaid}
          </pre>
        </details>
      )}
    </div>
  );
}
