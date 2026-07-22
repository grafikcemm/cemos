/**
 * CemOS Learn — v2 Pack Artifact zarfı (4C-C). LearnPack.notesJson içinde YAŞAR
 * (yeni tablo ailesi YOK). Zod-doğrulu; atomik notlar + typed graph + görevler +
 * içerik fikirleri + provenance. Legacy notesJson ("[]" veya eski şekil) güvenli
 * okunur — parse hatası "boş başarı" DEĞİL, açıkça invalid döner.
 *
 * Grafik: node'lar concept/note'tan türer, edge'ler ilişki taşır. UI Mermaid'i
 * BURADAN (typed veri) deterministik + escape'li üretir — LLM'den ham Mermaid ÇALIŞTIRILMAZ.
 */

import { z } from "zod";
import { GroundingTypeSchema, type SourceBasis } from "./types";

export const ARTIFACT_VERSION = "v2" as const;

const ArtifactNoteSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()).default([]),
  chunkIdxs: z.array(z.number().int()).default([]),
  groundingType: GroundingTypeSchema,
  relatedConceptLabels: z.array(z.string()).default([]),
});
export type ArtifactNote = z.infer<typeof ArtifactNoteSchema>;

const ArtifactNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  kind: z.enum(["concept", "note", "topic"]),
});
export type ArtifactNode = z.infer<typeof ArtifactNodeSchema>;

const ArtifactEdgeSchema = z.object({
  source: z.string().min(1), // node id
  target: z.string().min(1), // node id
  relation: z.string(),
  groundingType: GroundingTypeSchema,
});
export type ArtifactEdge = z.infer<typeof ArtifactEdgeSchema>;

const ArtifactGraphSchema = z.object({
  nodes: z.array(ArtifactNodeSchema).default([]),
  edges: z.array(ArtifactEdgeSchema).default([]),
});
export type ArtifactGraph = z.infer<typeof ArtifactGraphSchema>;

const ArtifactTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  why: z.string().default(""),
  steps: z.array(z.string()).default([]),
  chunkIdxs: z.array(z.number().int()).default([]),
  groundingType: GroundingTypeSchema,
  status: z.enum(["open", "done"]).default("open"),
});
export type ArtifactTask = z.infer<typeof ArtifactTaskSchema>;

const ArtifactIdeaSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  angle: z.string().default(""),
  hook: z.string().default(""),
  format: z.string().default(""),
  sourceConceptLabels: z.array(z.string()).default([]),
  groundingType: GroundingTypeSchema,
});
export type ArtifactIdea = z.infer<typeof ArtifactIdeaSchema>;

export const LearnArtifactSchema = z.object({
  version: z.literal(ARTIFACT_VERSION),
  sourceBasis: z.enum(["transcript", "summary"]),
  atomicNotes: z.array(ArtifactNoteSchema).default([]),
  graph: ArtifactGraphSchema.default({ nodes: [], edges: [] }),
  tasks: z.array(ArtifactTaskSchema).default([]),
  contentIdeas: z.array(ArtifactIdeaSchema).default([]),
  /** Bu zarfa yazılmış artifact aşamaları (checkpoint izi). */
  stages: z.array(z.string()).default([]),
});
export type LearnArtifact = z.infer<typeof LearnArtifactSchema>;

export type ArtifactParse =
  | { kind: "v2"; artifact: LearnArtifact }
  | { kind: "legacy"; raw: unknown } // eski dizi / şekil — okunur, v2 değil
  | { kind: "invalid"; error: string }; // parse/şema hatası — SESSİZCE boş sayılmaz

/**
 * notesJson → typed sonuç. Boş/legacy dizi → legacy. version==="v2" obje → Zod.
 * JSON kırık veya v2 şema tutmuyor → invalid (çağıran boş başarı sanmaz).
 */
export function parseArtifact(notesJson: string): ArtifactParse {
  let raw: unknown;
  try {
    raw = JSON.parse(notesJson && notesJson.trim() !== "" ? notesJson : "[]");
  } catch (e) {
    return { kind: "invalid", error: e instanceof Error ? e.message : "json_parse" };
  }
  if (Array.isArray(raw)) return { kind: "legacy", raw }; // v1 notesJson="[]" veya eski not ağacı
  if (raw && typeof raw === "object" && (raw as { version?: unknown }).version === ARTIFACT_VERSION) {
    const parsed = LearnArtifactSchema.safeParse(raw);
    if (parsed.success) return { kind: "v2", artifact: parsed.data };
    return {
      kind: "invalid",
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  return { kind: "legacy", raw };
}

export function emptyArtifact(basis: SourceBasis): LearnArtifact {
  return {
    version: ARTIFACT_VERSION,
    sourceBasis: basis,
    atomicNotes: [],
    graph: { nodes: [], edges: [] },
    tasks: [],
    contentIdeas: [],
    stages: [],
  };
}

/** v2 ise mevcut zarf, değilse taze zarf (aşamalar sıfırdan yazar; resume güvenli). */
export function artifactOrEmpty(notesJson: string, basis: SourceBasis): LearnArtifact {
  const p = parseArtifact(notesJson);
  return p.kind === "v2" ? p.artifact : emptyArtifact(basis);
}

export function serializeArtifact(a: LearnArtifact): string {
  return JSON.stringify(a);
}

function markStage(stages: string[], stage: string): string[] {
  return stages.includes(stage) ? stages : [...stages, stage];
}

/** notes aşaması: atomik notlara stable id (n1..) ver, zarfa yaz (idempotent overwrite). */
export function withNotes(
  a: LearnArtifact,
  notes: Omit<ArtifactNote, "id">[]
): LearnArtifact {
  return {
    ...a,
    atomicNotes: notes.map((n, i) => ({ ...n, id: `n${i + 1}` })),
    stages: markStage(a.stages, "notes"),
  };
}

/** graph aşaması: typed node+edge (label→id çözümü orchestrator'da yapılır). */
export function withGraph(a: LearnArtifact, graph: ArtifactGraph): LearnArtifact {
  return { ...a, graph, stages: markStage(a.stages, "graph") };
}

export function withTasks(
  a: LearnArtifact,
  tasks: Omit<ArtifactTask, "id" | "status">[]
): LearnArtifact {
  return {
    ...a,
    tasks: tasks.map((t, i) => ({ ...t, id: `t${i + 1}`, status: "open" as const })),
    stages: markStage(a.stages, "tasks"),
  };
}

export function withContentIdeas(
  a: LearnArtifact,
  ideas: Omit<ArtifactIdea, "id">[]
): LearnArtifact {
  return {
    ...a,
    contentIdeas: ideas.map((c, i) => ({ ...c, id: `i${i + 1}` })),
    stages: markStage(a.stages, "content_ideas"),
  };
}

/** Mermaid node/edge etiketi güvenli hale getir (escape + kısalt). Boşsa "•". */
function escLabel(s: string): string {
  const cleaned = s
    .replace(/["`]/g, "'")
    .replace(/[\r\n]+/g, " ")
    .replace(/[[\]{}<>|()#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned === "" ? "•" : cleaned;
}

function safeNodeId(id: string): string {
  return "n_" + id.replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * Typed graph → Mermaid metni (deterministik + escape'li). Yalnız var olan node'lara
 * bağlanan edge'ler çizilir (dangling edge atlanır). UI bunu render eder; ham LLM YOK.
 */
export function graphToMermaid(graph: ArtifactGraph): string {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const lines: string[] = ["graph TD"];
  for (const n of graph.nodes) {
    lines.push(`  ${safeNodeId(n.id)}["${escLabel(n.label)}"]`);
  }
  for (const e of graph.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue; // dangling atla
    const rel = escLabel(e.relation);
    lines.push(`  ${safeNodeId(e.source)} -->|${rel}| ${safeNodeId(e.target)}`);
  }
  return lines.join("\n");
}
