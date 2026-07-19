/**
 * CemOS Learn — Obsidian bundle derleme + geri-uyumlu yerel yazma adaptörü.
 * Bundle montajı (deterministik, v2 artifact dahil) BURADA; sertleştirilmiş yazma
 * (atomic, symlink kaçış koruması, conflict, already_current) localVault.ts'te.
 * exportPackToVault orchestrator'ın fire-and-forget çağrısı için legacy şekli korur.
 */

import { getObsidianVaultPath } from "./learnConfig";
import { assemblePackExport } from "./packExport";
import { buildObsidianBundle, type ObsidianBundle } from "./obsidian";
import { writeLocalVault } from "./localVault";

export type ExportResult = { written: number; folder: string } | null;

/**
 * Pack'in Obsidian bundle'ını (deterministik, v2 artifact dahil) DB'den derler.
 * Yerel vault + GitHub köprüsü + ZIP aynı montajı paylaşır. Pack yok / hazır değil → null.
 */
export async function buildPackBundleForExport(packId: string): Promise<ObsidianBundle | null> {
  const pack = await assemblePackExport(packId);
  if (!pack || pack.status !== "ready") return null;
  return buildObsidianBundle(pack);
}

/**
 * packId'yi yerel vault'a yazar (sertleştirilmiş yol). vault yok / pack yok /
 * hazır değil → null. Orchestrator fire-and-forget çağırır (dönüş yok sayılır).
 */
export async function exportPackToVault(packId: string): Promise<ExportResult> {
  try {
    const vault = getObsidianVaultPath();
    if (!vault) return null;
    const bundle = await buildPackBundleForExport(packId);
    if (!bundle) return null;
    const r = await writeLocalVault(bundle, vault);
    return { written: r.written, folder: bundle.folderName };
  } catch (err) {
    console.warn(`[learn] obsidian write failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
