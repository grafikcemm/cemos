/**
 * Güvenli production migration workflow'u (ADR-035 / DB-SAFETY.md).
 *
 *   npx tsx scripts/safe-migrate-deploy.ts            # tam akış
 *   npx tsx scripts/safe-migrate-deploy.ts --scan-only # yalnız statik SQL taraması
 *
 * Akış (hepsi zorunlu, sıra bağlayıcı):
 *   1. prisma/migrations altındaki TÜM migration.sql dosyaları destructive
 *      kalıplara karşı statik taranır — bulgu varsa DEPLOY YOK (exit 2).
 *   2. Read-only satır-sayısı snapshot'ı (öncesi).
 *   3. `prisma migrate deploy` (yalnız elle yazılmış additive SQL uygular;
 *      shadow DB kullanmaz, reset yapmaz).
 *   4. İkinci `migrate deploy` → "No pending migrations" beklenir (idempotency).
 *   5. Read-only snapshot (sonrası) — sayılar azaldıysa exit 1 ile raporlanır.
 *
 * `migrate diff --shadow-database-url`, `migrate dev`, `migrate reset` bu
 * repo'da production DATABASE_URL ile ASLA çalıştırılmaz. Secret basılmaz.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  sanitizeDbHostFingerprint,
  scanMigrationSqlForDestructiveOps,
} from "../src/lib/db/urlSafety";

const SCAN_ONLY = process.argv.includes("--scan-only");
const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

function scanAllMigrations(): boolean {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.log("prisma/migrations yok — taranacak SQL yok.");
    return true;
  }
  let clean = true;
  for (const dir of readdirSync(MIGRATIONS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const sqlPath = join(MIGRATIONS_DIR, dir.name, "migration.sql");
    if (!existsSync(sqlPath)) continue;
    const findings = scanMigrationSqlForDestructiveOps(readFileSync(sqlPath, "utf8"));
    if (findings.length === 0) {
      console.log(`OK  ${dir.name} — additive görünüm`);
    } else {
      clean = false;
      for (const f of findings) {
        console.error(`DESTRUCTIVE  ${dir.name}:${f.line} [${f.code}] ${f.snippet}`);
      }
    }
  }
  return clean;
}

async function rowCounts(): Promise<Record<string, number>> {
  const { prisma } = await import("../src/lib/db/client");
  const [queueItems, accounts, newsItems, usageLogs, seriesProfiles, captionDna] =
    await Promise.all([
      prisma.queueItem.count(),
      prisma.account.count(),
      prisma.newsItem.count(),
      prisma.usageLog.count(),
      prisma.seriesProfile.count(),
      prisma.captionDna.count(),
    ]);
  return { queueItems, accounts, newsItems, usageLogs, seriesProfiles, captionDna };
}

function deploy(): { status: number; stdout: string } {
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const stdout = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  process.stdout.write(stdout);
  return { status: r.status ?? 1, stdout };
}

async function main() {
  console.log("— 1/5 statik destructive taraması —");
  if (!scanAllMigrations()) {
    console.error(
      "Destructive SQL bulundu — deploy REDDEDİLDİ. Additive alternatif tasarla (DB-SAFETY.md)."
    );
    process.exit(2);
  }
  if (SCAN_ONLY) {
    console.log("scan-only tamam.");
    return;
  }

  const target = sanitizeDbHostFingerprint(process.env.DATABASE_URL ?? "");
  console.log(`— 2/5 öncesi read-only snapshot (${target}) —`);
  const before = await rowCounts();
  console.log(JSON.stringify(before));

  console.log("— 3/5 prisma migrate deploy —");
  const first = deploy();
  if (first.status !== 0) {
    console.error("migrate deploy başarısız — snapshot değişmedi varsayma, elle incele.");
    process.exit(1);
  }

  console.log("— 4/5 idempotency: ikinci deploy —");
  const second = deploy();
  if (second.status !== 0 || !/No pending migrations/i.test(second.stdout)) {
    console.error("İkinci deploy 'No pending migrations' üretmedi — durum belirsiz, elle incele.");
    process.exit(1);
  }

  console.log("— 5/5 sonrası read-only snapshot —");
  const after = await rowCounts();
  console.log(JSON.stringify(after));
  const shrunk = Object.keys(before).filter((k) => after[k] < before[k]);
  if (shrunk.length > 0) {
    console.error(`SATIR KAYBI TESPİT EDİLDİ: ${shrunk.join(", ")} — derhal incele.`);
    process.exit(1);
  }
  console.log("Tamam: additive deploy + idempotent ikinci koşu + satır kaybı yok.");
}

main().catch((e) => {
  console.error("safe-migrate-deploy hata:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
