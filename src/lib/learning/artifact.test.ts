import { describe, it, expect } from "vitest";
import {
  parseArtifact,
  emptyArtifact,
  artifactOrEmpty,
  serializeArtifact,
  withNotes,
  withGraph,
  withTasks,
  withContentIdeas,
  graphToMermaid,
  LearnArtifactSchema,
} from "./artifact";

describe("parseArtifact", () => {
  it("legacy notesJson='[]' → kind legacy (boş başarı DEĞİL, invalid DEĞİL)", () => {
    const r = parseArtifact("[]");
    expect(r.kind).toBe("legacy");
  });

  it("legacy eski not-ağacı dizisi → legacy raw korunur", () => {
    const r = parseArtifact('[{"heading":"x"}]');
    expect(r.kind).toBe("legacy");
    if (r.kind === "legacy") expect(Array.isArray(r.raw)).toBe(true);
  });

  it("bozuk JSON → invalid (parse hatası boş sayılmaz)", () => {
    const r = parseArtifact("{not json");
    expect(r.kind).toBe("invalid");
  });

  it("boş string → legacy (varsayılan '[]')", () => {
    expect(parseArtifact("").kind).toBe("legacy");
  });

  it("geçerli v2 zarf → v2 + artifact döner", () => {
    const a = emptyArtifact("transcript");
    const r = parseArtifact(serializeArtifact(a));
    expect(r.kind).toBe("v2");
    if (r.kind === "v2") expect(r.artifact.version).toBe("v2");
  });

  it("version=v2 ama şema tutmuyor → invalid (sessiz boş DEĞİL)", () => {
    const r = parseArtifact('{"version":"v2","sourceBasis":"BAD"}');
    expect(r.kind).toBe("invalid");
  });
});

describe("artifactOrEmpty", () => {
  it("legacy → basis'e göre taze zarf", () => {
    const a = artifactOrEmpty("[]", "summary");
    expect(a.sourceBasis).toBe("summary");
    expect(a.atomicNotes).toEqual([]);
  });
  it("v2 → mevcut zarf", () => {
    const src = withNotes(emptyArtifact("transcript"), [
      { title: "T", body: "B", tags: [], chunkIdxs: [0], groundingType: "source_supported", relatedConceptLabels: [] },
    ]);
    const a = artifactOrEmpty(serializeArtifact(src), "transcript");
    expect(a.atomicNotes).toHaveLength(1);
  });
});

describe("merge helpers assign stable ids + mark stages", () => {
  it("withNotes → n1..n, stages içerir notes", () => {
    const a = withNotes(emptyArtifact("transcript"), [
      { title: "A", body: "a", tags: [], chunkIdxs: [], groundingType: "source_supported", relatedConceptLabels: [] },
      { title: "B", body: "b", tags: [], chunkIdxs: [], groundingType: "inference", relatedConceptLabels: [] },
    ]);
    expect(a.atomicNotes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(a.stages).toContain("notes");
  });

  it("withTasks → t1.. + status open default", () => {
    const a = withTasks(emptyArtifact("transcript"), [
      { title: "Do", why: "", steps: ["s1"], chunkIdxs: [], groundingType: "inference" },
    ]);
    expect(a.tasks[0].id).toBe("t1");
    expect(a.tasks[0].status).toBe("open");
  });

  it("withContentIdeas → i1..", () => {
    const a = withContentIdeas(emptyArtifact("summary"), [
      { title: "Idea", angle: "", hook: "", format: "reel", sourceConceptLabels: [], groundingType: "inference" },
    ]);
    expect(a.contentIdeas[0].id).toBe("i1");
  });

  it("withGraph marks graph, round-trips through schema", () => {
    const a = withGraph(emptyArtifact("transcript"), {
      nodes: [{ id: "c1", label: "X", kind: "concept" }],
      edges: [],
    });
    expect(a.stages).toContain("graph");
    expect(LearnArtifactSchema.safeParse(a).success).toBe(true);
  });
});

describe("graphToMermaid", () => {
  it("typed node/edge → graph TD + label escape", () => {
    const m = graphToMermaid({
      nodes: [
        { id: "c1", label: 'A "quote" [x]', kind: "concept" },
        { id: "c2", label: "B", kind: "note" },
      ],
      edges: [{ source: "c1", target: "c2", relation: "önkoşul", groundingType: "inference" }],
    });
    expect(m.startsWith("graph TD")).toBe(true);
    expect(m).toContain("-->|önkoşul|");
    expect(m).not.toContain('"quote"'); // çift tırnak escape edildi
    expect(m).not.toContain("[x]"); // köşeli parantez temizlendi
  });

  it("dangling edge (olmayan node) atlanır", () => {
    const m = graphToMermaid({
      nodes: [{ id: "c1", label: "A", kind: "concept" }],
      edges: [{ source: "c1", target: "ghost", relation: "r", groundingType: "inference" }],
    });
    expect(m).not.toContain("ghost");
    expect(m).not.toContain("-->");
  });

  it("boş etiket → •", () => {
    const m = graphToMermaid({
      nodes: [{ id: "c1", label: "   ", kind: "topic" }],
      edges: [],
    });
    expect(m).toContain("•");
  });
});
