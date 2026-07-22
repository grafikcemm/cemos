/**
 * Read-only credential-encryption audit.
 *
 * Counts how many `IntegrationCredential` rows are stored WITHOUT the AES-256-GCM
 * `v1:` prefix, i.e. plaintext at rest (written before encryption shipped, or
 * while `CREDENTIAL_ENC_KEY` was unset). NEVER prints any credential value — only
 * aggregate counts. If `plaintextAtRest > 0`, re-save those integrations so
 * `secretCrypto.encodeValue` re-encrypts them.
 *
 *   npx tsx scripts/audit-credential-encryption.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../src/lib/db/client";

(async () => {
  const total = await prisma.integrationCredential.count();
  const plaintextAtRest = await prisma.integrationCredential.count({
    where: { NOT: { value: { startsWith: "v1:" } } },
  });
  console.log(JSON.stringify({ total, plaintextAtRest }));
  await prisma.$disconnect();
})().catch((e) => {
  console.error("audit hata:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
