/**
 * Guard'lı `db push` (ADR-035). `npm run db:push` artık buradan geçer:
 * DATABASE_URL production-benzeriyse REDDEDER (2026-07-17 migrate-diff olayı
 * sonrası bağlayıcı kural). Yerel/ephemeral hedefte normal `prisma db push`
 * çalıştırır. Production şema değişikliği tek yol: DB-SAFETY.md prosedürü
 * (elle additive SQL + `npm run db:migrate`).
 *
 * Secret basılmaz — yalnız sanitize host fingerprint.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { spawnSync } from "node:child_process";
import {
  assertSafeDbPushTarget,
  sanitizeDbHostFingerprint,
} from "../src/lib/db/urlSafety";

const url = process.env.DATABASE_URL ?? "";
try {
  assertSafeDbPushTarget(url);
} catch (err) {
  console.error(`ENGELLENDİ: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

console.log(`db push hedefi yerel/ephemeral: ${sanitizeDbHostFingerprint(url)}`);
const r = spawnSync("npx", ["prisma", "db", "push", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
