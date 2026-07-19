/**
 * CemOS Learn — sertleştirilmiş yerel Obsidian vault yazıcısı (4D, server-only Node fs).
 * Güvenlik + dürüstlük garantileri:
 *  - Vault kökü realpath ile doğrulanır; kök dışına (symlink/junction kaçışı dahil) ASLA yazılmaz.
 *  - Atomic yazma: aynı dizinde temp dosya → rename (yarım markdown bırakmaz).
 *  - Managed-marker conflict: unmanaged (kullanıcı notu) veya başka pack dosyası ÜZERİNE YAZILMAZ
 *    → typed conflict. Paylaşımlı kavram notu çok-pack birleştirilir (önceki kaynak korunur).
 *  - already_current: içerik/blok zaten güncelse dosya yeniden yazılmaz (unchanged).
 *  - Secret/tam-path sonuçta tutulmaz; hedef = "yerel vault" + path'in hash parmak izi.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { ObsidianBundle } from "./obsidian";
import {
  aggregate,
  type ChannelResult,
  type ExportFileResult,
} from "./obsidianExport";
import {
  contentHash,
  isManagedFile,
  mergeSharedConceptFile,
  packIdOf,
} from "./obsidianManifest";

let tmpCounter = 0;

function isInside(root: string, p: string): boolean {
  return p === root || p.startsWith(root + path.sep);
}

/** Atomic yazma: temp dosya + rename. Aynı dizinde temp → aynı FS, rename atomik. */
async function atomicWrite(target: string, content: string): Promise<void> {
  const dir = path.dirname(target);
  tmpCounter = (tmpCounter + 1) % 1_000_000;
  const tmp = path.join(dir, `.cemos-tmp-${process.pid}-${tmpCounter}-${path.basename(target)}`);
  await fs.writeFile(tmp, content, "utf8");
  try {
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Bundle'ı yerel vault'a yaz. vaultPath configured değilse ÇAĞIRAN not_configured döner
 * (buraya boş path gelmez). Kök yoksa/erişilemezse failed(vault_not_found).
 */
export async function writeLocalVault(
  bundle: ObsidianBundle,
  vaultPath: string
): Promise<ChannelResult> {
  let realRoot: string;
  try {
    realRoot = await fs.realpath(path.resolve(vaultPath));
  } catch {
    return {
      channel: "local_vault",
      state: "failed",
      written: 0,
      unchanged: 0,
      failed: 1,
      conflict: 0,
      manifestHash: bundle.manifestHash,
      targetLabel: "yerel vault",
      targetFingerprint: contentHash(path.resolve(vaultPath)),
      errorClass: "vault_not_found",
      files: [],
      message: "Vault kökü bulunamadı/erişilemiyor.",
    };
  }

  const results: ExportFileResult[] = [];
  for (const f of bundle.files) {
    results.push(await writeOne(realRoot, f.path, f.content, f.scope, bundle.packId));
  }

  return aggregate(
    "local_vault",
    results,
    bundle.manifestHash,
    "yerel vault",
    contentHash(realRoot)
  );
}

async function writeOne(
  realRoot: string,
  relPath: string,
  incoming: string,
  scope: "owned" | "shared",
  packId: string
): Promise<ExportFileResult> {
  const target = path.resolve(realRoot, relPath);
  // Lexical kök-içi kontrolü (hızlı `..` reddi).
  if (!isInside(realRoot, target)) {
    return { path: relPath, outcome: "conflict", errorClass: "path_escape" };
  }
  const dir = path.dirname(target);
  try {
    await fs.mkdir(dir, { recursive: true });
    // Symlink/junction kaçışı: dizinin GERÇEK yolu kök içinde mi?
    const realDir = await fs.realpath(dir);
    if (!isInside(realRoot, realDir)) {
      return { path: relPath, outcome: "conflict", errorClass: "symlink_escape" };
    }

    // Hedef var mı + symlink mi?
    let existing: string | null = null;
    try {
      const st = await fs.lstat(target);
      if (st.isSymbolicLink()) {
        return { path: relPath, outcome: "conflict", errorClass: "symlink_target" };
      }
      existing = await fs.readFile(target, "utf8");
    } catch {
      existing = null;
    }

    if (scope === "shared") {
      const merged = mergeSharedConceptFile(existing, incoming, packId);
      if (merged.kind === "conflict") {
        return { path: relPath, outcome: "conflict", errorClass: merged.reason };
      }
      if (merged.kind === "unchanged") {
        return { path: relPath, outcome: "unchanged" };
      }
      await atomicWrite(target, merged.content);
      return { path: relPath, outcome: "written" };
    }

    // owned dosya
    if (existing !== null) {
      if (!isManagedFile(existing)) {
        return { path: relPath, outcome: "conflict", errorClass: "unmanaged" };
      }
      const owner = packIdOf(existing);
      if (owner !== null && owner !== packId) {
        return { path: relPath, outcome: "conflict", errorClass: "other_pack" };
      }
      if (existing === incoming) {
        return { path: relPath, outcome: "unchanged" };
      }
    }
    await atomicWrite(target, incoming);
    return { path: relPath, outcome: "written" };
  } catch (err) {
    return {
      path: relPath,
      outcome: "failed",
      errorClass: err instanceof Error && "code" in err ? String((err as { code: unknown }).code) : "write_error",
    };
  }
}
