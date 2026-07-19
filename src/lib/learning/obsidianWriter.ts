/**
 * CemOS Learn — Obsidian yerel vault yazıcısı (server-only, Node fs). Pack hazır
 * olunca markdown dosyalarını OBSIDIAN_VAULT_PATH klasörüne yazar (yerel birikim).
 * YALNIZ "ready" (QA-geçmiş) pack yazılır → grounding garantisi korunur. Vercel'de
 * path set edilmez → not_configured. Sertleştirilmiş sürüm (atomic write, symlink
 * kaçış koruması, unmanaged-conflict, already_current skip) exportService/localVault'ta;
 * bu modül bundle derleme + geri-uyumlu ince yazıcıyı tutar.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getObsidianVaultPath } from "./learnConfig";
import { assemblePackExport } from "./packExport";
import { buildObsidianBundle, type ObsidianBundle } from "./obsidian";

export type ExportResult = { written: number; folder: string } | null;

/**
 * Pack'in Obsidian bundle'ını (deterministik, v2 artifact dahil) DB'den derler.
 * Yerel vault yazıcısı ve GitHub vault köprüsü aynı montajı paylaşır. Pack yok /
 * hazır değil → null (yalnız ready pack dışa aktarılır).
 */
export async function buildPackBundleForExport(packId: string): Promise<ObsidianBundle | null> {
  const pack = await assemblePackExport(packId);
  if (!pack || pack.status !== "ready") return null;
  return buildObsidianBundle(pack);
}

/**
 * packId'yi vault'a yazar. vault yok / pack yok / pack hazır değil → null.
 * Path-traversal koruması: vault kökü dışına yazma. (Atomic write + symlink kaçış +
 * conflict koruması sertleştirilmiş yolda — writeLocalVault.)
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
