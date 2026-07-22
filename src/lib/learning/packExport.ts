/**
 * CemOS Learn — pack export DTO derleyicisi (4D). Obsidian bundle üreticisinin
 * ihtiyaç duyduğu TAM veriyi (v2 artifact dahil) repolardan toplar. YALNIZ repo +
 * artifact + types import eder → learnService/orchestrator'a bağımlı DEĞİL (import
 * döngüsü yok: learnService → orchestrator → exportService zinciri temiz kalır).
 *
 * getPackDetail (UI) ile aynı alanları taşır ama export-odaklı + ready durumunu
 * ÇAĞIRANA bırakır (route 409, yazıcı null). createdAtIso stable → deterministik
 * frontmatter (export anı `now()` markdown'a GÖMÜLMEZ).
 */

import { safeJsonParse } from "@/lib/growth-engine/types";
import { learnPackRepo } from "@/lib/db/learnPackRepo";
import { learnSourceRepo } from "@/lib/db/learnSourceRepo";
import { learnTranscriptRepo } from "@/lib/db/learnTranscriptRepo";
import { basisForKind, type SourceBasis } from "./types";
import {
  parseArtifact,
  type ArtifactNote,
  type ArtifactGraph,
  type ArtifactTask,
  type ArtifactIdea,
} from "./artifact";

/** Zaman-kodlu transkript sağlayıcıları (gerçek timestamp gösterilebilir). */
const TIMED_PROVIDERS = new Set(["innertube", "timedtext", "supadata", "gemini"]);

export type PackExportConcept = {
  id: string;
  label: string;
  definition: string;
  importance: number;
  masteryScore: number;
  grounding: { chunkIdx: number }[];
};

export type PackExportItem = {
  id: string;
  kind: string;
  front: string;
  back: string;
  options: string[];
  correctIdx: number | null;
  chunkIdx: number | null;
  groundingType: string;
};

export type PackExport = {
  id: string;
  status: string;
  category: string;
  pipelineVersion: string;
  promptVersion: string;
  masteryScore: number;
  summaryL1: string;
  summaryL2: string;
  summaryL3: string;
  createdAtIso: string; // stable — deterministik frontmatter
  sourceBasis: SourceBasis; // transcript | summary (NotebookLM)
  provider: string | null; // manual | notebooklm | innertube | ...
  hasTimestamps: boolean; // false → sahte timestamp ÜRETİLMEZ
  hasArtifact: boolean; // v2 artifact var mı (legacy/v1 pack → false)
  qa: { verdict: string; coverage: number; flaggedCount: number };
  source: { kind: string; title: string; channelTitle: string; url: string } | null;
  concepts: PackExportConcept[];
  items: PackExportItem[];
  chunks: { idx: number; startSec: number; text: string }[];
  atomicNotes: ArtifactNote[];
  graph: ArtifactGraph;
  tasks: ArtifactTask[];
  contentIdeas: ArtifactIdea[];
};

/**
 * Pack'in export DTO'sunu derle. Pack yok → null. Ready kontrolü ÇAĞIRANDA
 * (route not-ready'de 409, yazıcı null döner).
 */
export async function assemblePackExport(packId: string): Promise<PackExport | null> {
  const pack = await learnPackRepo.getFull(packId);
  if (!pack) return null;

  const [source, chunks, transcript] = await Promise.all([
    learnSourceRepo.getById(pack.sourceId),
    learnTranscriptRepo.listChunks(pack.sourceId),
    learnTranscriptRepo.getBySource(pack.sourceId),
  ]);

  const basis = basisForKind(source?.kind ?? "youtube");
  const provider = transcript?.provider ?? null;
  const hasTimestamps = provider ? TIMED_PROVIDERS.has(provider) : false;

  const parsed = parseArtifact(pack.notesJson);
  const artifact = parsed.kind === "v2" ? parsed.artifact : null;

  const qaRaw = safeJsonParse<{ verdict?: string; coverage?: number; flagged?: unknown[] }>(
    pack.qaReportJson,
    {}
  );

  const firstChunk = (json: string) =>
    safeJsonParse<{ chunkIdx: number }[]>(json, [])[0]?.chunkIdx ?? null;

  return {
    id: pack.id,
    status: pack.status,
    category: pack.category,
    pipelineVersion: pack.pipelineVersion,
    promptVersion: pack.promptVersion,
    masteryScore: pack.masteryScore,
    summaryL1: pack.summaryL1,
    summaryL2: pack.summaryL2,
    summaryL3: pack.summaryL3,
    createdAtIso: pack.createdAt.toISOString(),
    sourceBasis: basis,
    provider,
    hasTimestamps,
    hasArtifact: artifact !== null,
    qa: {
      verdict: typeof qaRaw.verdict === "string" ? qaRaw.verdict : "—",
      coverage: typeof qaRaw.coverage === "number" ? qaRaw.coverage : 0,
      flaggedCount: Array.isArray(qaRaw.flagged) ? qaRaw.flagged.length : 0,
    },
    source: source
      ? {
          kind: source.kind,
          title: source.title,
          channelTitle: source.channelTitle,
          url: source.url,
        }
      : null,
    concepts: pack.concepts.map((c) => ({
      id: c.id,
      label: c.label,
      definition: c.definition,
      importance: c.importance,
      masteryScore: c.masteryScore,
      grounding: safeJsonParse<{ chunkIdx: number }[]>(c.groundingJson, []),
    })),
    items: pack.items.map((it) => ({
      id: it.id,
      kind: it.kind,
      front: it.front,
      back: it.back,
      options: safeJsonParse<string[]>(it.optionsJson, []),
      correctIdx: it.correctIdx,
      chunkIdx: firstChunk(it.groundingJson),
      groundingType: it.groundingType,
    })),
    chunks: chunks.map((c) => ({ idx: c.idx, startSec: c.startSec, text: c.text })),
    atomicNotes: artifact?.atomicNotes ?? [],
    graph: artifact?.graph ?? { nodes: [], edges: [] },
    tasks: artifact?.tasks ?? [],
    contentIdeas: artifact?.contentIdeas ?? [],
  };
}
