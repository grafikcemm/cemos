/**
 * CemOS Learn — Obsidian otomatik yazma (server-only, Node fs). Pack hazır olunca
 * markdown dosyalarını OBSIDIAN_VAULT_PATH klasörüne yazar (local birikim). Sadece
 * "ready" (QA-geçmiş) pack yazılır → grounding garantisi korunur. ASLA throw etmez
 * (fail-open: yazamazsa job'u bozmaz). Vercel'de path set edilmez → no-op.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { safeJsonParse } from "@/lib/growth-engine/types";
import { learnPackRepo } from "@/lib/db/learnPackRepo";
import { learnSourceRepo } from "@/lib/db/learnSourceRepo";
import { learnTranscriptRepo } from "@/lib/db/learnTranscriptRepo";
import { getObsidianVaultPath } from "./learnConfig";
import { buildObsidianBundle, type ObsidianBundle, type ObsidianPack } from "./obsidian";

export type ExportResult = { written: number; folder: string } | null;

/**
 * Pack'in Obsidian bundle'ını (dosya listesi) DB'den derler. Yerel vault
 * yazıcısı ve GitHub vault köprüsü (githubVault.ts) aynı montajı paylaşır.
 * Pack yok / hazır değil → null.
 */
export async function buildPackBundleForExport(packId: string): Promise<ObsidianBundle | null> {
  const pack = await learnPackRepo.getFull(packId);
  if (!pack || pack.status !== "ready") return null;

  const [source, chunks] = await Promise.all([
    learnSourceRepo.getById(pack.sourceId),
    learnTranscriptRepo.listChunks(pack.sourceId),
  ]);
  const firstChunk = (json: string) =>
    safeJsonParse<{ chunkIdx: number }[]>(json, [])[0]?.chunkIdx ?? null;

  const data: ObsidianPack = {
    id: pack.id,
    category: pack.category,
    masteryScore: pack.masteryScore,
    summaryL1: pack.summaryL1,
    summaryL2: pack.summaryL2,
    summaryL3: pack.summaryL3,
    source: source
      ? { title: source.title, channelTitle: source.channelTitle, url: source.url }
      : null,
    concepts: pack.concepts.map((c) => ({
      label: c.label,
      definition: c.definition,
      importance: c.importance,
      masteryScore: c.masteryScore,
      grounding: safeJsonParse<{ chunkIdx: number }[]>(c.groundingJson, []),
    })),
    items: pack.items.map((it) => ({
      kind: it.kind,
      front: it.front,
      back: it.back,
      options: safeJsonParse<string[]>(it.optionsJson, []),
      correctIdx: it.correctIdx,
      chunkIdx: firstChunk(it.groundingJson),
    })),
    chunks: chunks.map((c) => ({ idx: c.idx, startSec: c.startSec, text: c.text })),
  };

  return buildObsidianBundle(data, new Date().toISOString());
}

/**
 * packId'yi vault'a yazar. vault yok / pack yok / pack hazır değil → null.
 */
export async function exportPackToVault(packId: string): Promise<ExportResult> {
  try {
    const vault = getObsidianVaultPath();
    if (!vault) return null;

    const bundle = await buildPackBundleForExport(packId);
    if (!bundle) return null;

    const vaultRoot = path.resolve(vault);
    let written = 0;
    for (const f of bundle.files) {
      const resolved = path.resolve(vaultRoot, f.path);
      // Path-traversal koruması: vault kökü dışına yazma.
      if (resolved !== vaultRoot && !resolved.startsWith(vaultRoot + path.sep)) continue;
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, f.content, "utf8");
      written += 1;
    }
    return { written, folder: bundle.folderName };
  } catch (err) {
    console.warn(`[learn] obsidian write failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
