/**
 * One-shot hard delete of the retired "pixelspor" account and ALL its
 * dependent rows. The Prisma schema has no `onDelete: Cascade`, so children
 * MUST be deleted before the Account row in foreign-key order.
 *
 * SAFETY: take a Neon branch/backup before running. Run AFTER the code that
 * no longer references pixelspor is deployed, so nothing recreates the rows.
 *
 *   npx tsx scripts/delete-pixelspor.ts          # dry-run (counts only)
 *   npx tsx scripts/delete-pixelspor.ts --commit # actually delete
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const HANDLE = "pixelspor";

async function main() {
  const account = await prisma.account.findUnique({ where: { handle: HANDLE } });
  if (!account) {
    console.log(`No "${HANDLE}" account found — nothing to delete.`);
    return;
  }
  const accountId = account.id;
  console.log(`Found ${HANDLE} account: ${accountId}`);

  // Child tables in FK-safe order (all carry accountId). styleProfile/schedule
  // are 1:1; the rest are 1:N. CronRun is global and untouched.
  const ops: Array<{ name: string; del: () => Promise<{ count: number }> }> = [
    { name: "generationRun", del: () => prisma.generationRun.deleteMany({ where: { accountId } }) },
    { name: "queueItem", del: () => prisma.queueItem.deleteMany({ where: { accountId } }) },
    { name: "sourcePost", del: () => prisma.sourcePost.deleteMany({ where: { accountId } }) },
    { name: "source", del: () => prisma.source.deleteMany({ where: { accountId } }) },
    { name: "scanRun", del: () => prisma.scanRun.deleteMany({ where: { accountId } }) },
    { name: "usageLog", del: () => prisma.usageLog.deleteMany({ where: { accountId } }) },
    { name: "publishLog", del: () => prisma.publishLog.deleteMany({ where: { accountId } }) },
    { name: "viralPattern", del: () => prisma.viralPattern.deleteMany({ where: { accountId } }) },
    { name: "trainingExample", del: () => prisma.trainingExample.deleteMany({ where: { accountId } }) },
    { name: "feedbackEvent", del: () => prisma.feedbackEvent.deleteMany({ where: { accountId } }) },
    { name: "evalTest", del: () => prisma.evalTest.deleteMany({ where: { accountId } }) },
    { name: "styleProfile", del: () => prisma.styleProfile.deleteMany({ where: { accountId } }) },
    { name: "schedule", del: () => prisma.schedule.deleteMany({ where: { accountId } }) },
  ];

  if (!COMMIT) {
    console.log("DRY-RUN (pass --commit to delete). Row counts:");
    for (const op of ops) {
      const model = (prisma as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[op.name];
      const n = await model.count({ where: { accountId } });
      console.log(`  ${op.name}: ${n}`);
    }
    console.log("  account: 1");
    return;
  }

  // Sequential deletes (FK-safe order). Deliberately NOT in an interactive
  // transaction: Neon latency blows the 5s default timeout, and deleteMany is
  // idempotent — a re-run after partial failure just deletes the remainder.
  for (const op of ops) {
    const res = await op.del();
    console.log(`Deleted ${op.name}: ${res.count}`);
  }
  await prisma.account.delete({ where: { id: accountId } });
  console.log("Deleted account: 1");
  console.log(`✅ "${HANDLE}" fully removed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
