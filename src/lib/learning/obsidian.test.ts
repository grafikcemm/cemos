import { describe, it, expect } from "vitest";
import { buildObsidianBundle } from "./obsidian";
import type { PackExport } from "./packExport";

function mkPack(over: Partial<PackExport> = {}): PackExport {
  return {
    id: "pack_abc123def456",
    status: "ready",
    category: "yapay_zeka",
    pipelineVersion: "v2",
    promptVersion: "v2",
    masteryScore: 42,
    summaryL1: "Tek cümle özet.",
    summaryL2: "Yönetici özeti.",
    summaryL3: "Bölüm bölüm.",
    createdAtIso: "2026-07-19T10:00:00.000Z",
    sourceBasis: "transcript",
    provider: "innertube",
    hasTimestamps: true,
    hasArtifact: true,
    qa: { verdict: "pass", coverage: 0.82, flaggedCount: 0 },
    source: { kind: "youtube", title: "AI Video", channelTitle: "Kanal", url: "https://youtu.be/x" },
    concepts: [
      { id: "c1", label: "Transformer", definition: "Dikkat mekanizması.", importance: 90, masteryScore: 0, grounding: [{ chunkIdx: 2 }] },
    ],
    items: [
      { id: "it1", kind: "flashcard", front: "Nedir?", back: "Cevap", options: [], correctIdx: null, chunkIdx: 1, groundingType: "source_supported" },
      { id: "it2", kind: "quiz_mcq", front: "Soru?", back: "gerekçe", options: ["A", "B"], correctIdx: 1, chunkIdx: 2, groundingType: "source_supported" },
    ],
    chunks: [
      { idx: 0, startSec: 0, text: "..." },
      { idx: 1, startSec: 65, text: "..." },
      { idx: 2, startSec: 130, text: "..." },
    ],
    atomicNotes: [
      { id: "n1", title: "Dikkat mekanizması", body: "Tek fikir.", tags: ["ai"], chunkIdxs: [2], groundingType: "source_supported", relatedConceptLabels: ["Transformer"] },
    ],
    graph: {
      nodes: [
        { id: "c1", label: "Transformer", kind: "concept" },
        { id: "n1", label: "Dikkat mekanizması", kind: "note" },
      ],
      edges: [{ source: "c1", target: "n1", relation: "içerir", groundingType: "source_supported" }],
    },
    tasks: [{ id: "t1", title: "Uygula", why: "çünkü", steps: ["adım1"], chunkIdxs: [1], groundingType: "source_supported", status: "open" }],
    contentIdeas: [{ id: "i1", title: "Fikir", angle: "açı", hook: "kanca", format: "carousel", sourceConceptLabels: ["Transformer"], groundingType: "inference" }],
    ...over,
  };
}

describe("buildObsidianBundle — deterministik", () => {
  it("aynı pack → aynı manifest hash (now() gömülmez)", () => {
    const a = buildObsidianBundle(mkPack());
    const b = buildObsidianBundle(mkPack());
    expect(a.manifestHash).toBe(b.manifestHash);
  });

  it("hiçbir dosyada değişken 'created' export-anı yok — sadece stable createdAt", () => {
    const b = buildObsidianBundle(mkPack());
    for (const f of b.files) {
      if (f.content.includes("created:")) {
        expect(f.content).toContain("2026-07-19T10:00:00.000Z");
      }
    }
  });

  it("içerik değişince manifest değişir", () => {
    const a = buildObsidianBundle(mkPack());
    const b = buildObsidianBundle(mkPack({ summaryL1: "Farklı özet." }));
    expect(a.manifestHash).not.toBe(b.manifestHash);
  });
});

describe("buildObsidianBundle — v2 tam içerik", () => {
  it("atomik not / görev / içerik-fikri / kart / QA dosyaları var", () => {
    const b = buildObsidianBundle(mkPack());
    const paths = b.files.map((f) => f.path);
    expect(paths.some((p) => p.includes("/Notlar/"))).toBe(true);
    expect(paths.some((p) => p.endsWith("Görevler.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("İçerik Fikirleri.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("Kartlar.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("QA ve Kaynak Güvencesi.md"))).toBe(true);
    expect(paths.some((p) => p.includes("/Kavramlar/"))).toBe(true);
  });

  it("MOC Mermaid bloğunu typed graph'tan gömer", () => {
    const b = buildObsidianBundle(mkPack());
    const moc = b.files.find((f) => f.path.endsWith("AI Video.md"));
    expect(moc).toBeTruthy();
    expect(moc!.content).toContain("```mermaid");
    expect(moc!.content).toContain("graph TD");
  });

  it("kavram notu paylaşımlı (scope=shared) + çok-pack blok işaretçisi", () => {
    const b = buildObsidianBundle(mkPack());
    const concept = b.files.find((f) => f.path.includes("/Kavramlar/"));
    expect(concept!.scope).toBe("shared");
    expect(concept!.content).toContain("cemos:pack:pack_abc123def456");
    expect(concept!.content).toContain("cemos_shared: true");
  });
});

describe("buildObsidianBundle — v1/legacy uyumluluk", () => {
  it("artifact yok → MOC + kavram + kart yine üretilir, artifact bölümleri atlanır", () => {
    const b = buildObsidianBundle(
      mkPack({ hasArtifact: false, atomicNotes: [], graph: { nodes: [], edges: [] }, tasks: [], contentIdeas: [] })
    );
    const paths = b.files.map((f) => f.path);
    expect(paths.some((p) => p.endsWith("AI Video.md"))).toBe(true);
    expect(paths.some((p) => p.includes("/Kavramlar/"))).toBe(true);
    expect(paths.some((p) => p.endsWith("Kartlar.md"))).toBe(true);
    expect(paths.some((p) => p.includes("/Notlar/"))).toBe(false);
    expect(paths.some((p) => p.endsWith("Görevler.md"))).toBe(false);
  });
});

describe("buildObsidianBundle — NotebookLM provenance dürüstlüğü", () => {
  const nb = () =>
    buildObsidianBundle(
      mkPack({
        sourceBasis: "summary",
        provider: "notebooklm",
        hasTimestamps: false,
        source: { kind: "notebooklm_summary", title: "Özet", channelTitle: "", url: "https://youtu.be/x" },
      })
    );

  it("MOC 'NotebookLM özeti' uyarısı taşır, 'doğrulanmış transkript DEĞİL' der", () => {
    const b = nb();
    const moc = b.files.find((f) => f.path.endsWith("Özet.md"));
    expect(moc!.content).toContain("NotebookLM");
    expect(moc!.content).toMatch(/DEĞİL/);
  });

  it("summary pack sahte timestamp üretmez — kaynak notunda 'zaman-kodsuz'", () => {
    const b = nb();
    const src = b.files.find((f) => f.path.endsWith("Kaynak.md"));
    expect(src!.content).toContain("zaman-kodsuz");
    // hiçbir dosyada VIDEO mm:ss timestamp yok (frontmatter ISO 'created' hariç tut)
    for (const f of b.files) {
      const withoutIso = f.content.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "");
      expect(withoutIso).not.toMatch(/\b\d+:\d{2}\b/);
    }
  });

  it("frontmatter cemos_source_basis=summary + kaynak_kind notebooklm", () => {
    const b = nb();
    const moc = b.files.find((f) => f.path.endsWith("Özet.md"));
    expect(moc!.content).toContain("cemos_source_basis: summary");
    expect(moc!.content).toContain("cemos_source_kind: notebooklm_summary");
  });
});

describe("buildObsidianBundle — başlık çakışması + güvenlik", () => {
  it("aynı başlık farklı pack → farklı klasör (packId suffix)", () => {
    const a = buildObsidianBundle(mkPack({ id: "pack_aaaaaa111111" }));
    const b = buildObsidianBundle(mkPack({ id: "pack_bbbbbb222222" }));
    const aFolder = a.files.find((f) => f.path.endsWith("AI Video.md"))!.path.split("/").slice(0, 3).join("/");
    const bFolder = b.files.find((f) => f.path.endsWith("AI Video.md"))!.path.split("/").slice(0, 3).join("/");
    expect(aFolder).not.toBe(bFolder);
  });

  it("kötücül başlık path traversal üretmez", () => {
    const b = buildObsidianBundle(mkPack({ source: { kind: "youtube", title: "../../evil", channelTitle: "", url: "" } }));
    for (const f of b.files) {
      expect(f.path).not.toContain("..");
    }
  });

  it("Türkçe UTF-8 karakterler korunur", () => {
    const b = buildObsidianBundle(mkPack({ summaryL1: "Öğrenme çıktısı şükür." }));
    const moc = b.files.find((f) => f.path.endsWith("AI Video.md"));
    expect(moc!.content).toContain("Öğrenme çıktısı şükür.");
  });
});
