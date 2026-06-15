import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../src/lib/db/client";

async function main() {
  console.log("=== DB DIAGNOSTICS ===");
  const accounts = await prisma.account.findMany({
    include: { schedule: true }
  });
  console.log("ACCOUNTS:");
  for (const acc of accounts) {
    console.log(`- @${acc.handle} (ID: ${acc.id})`);
    console.log(`  Automation: ${acc.schedule?.automationEnabled}, Cadence: ${acc.schedule?.cadence}, Limit: ${acc.schedule?.dailyMaxPosts}, Last Scan: ${acc.schedule?.lastScanAt}`);
    
    const sourcePostsCount = await prisma.sourcePost.count({
      where: { accountId: acc.id }
    });
    const newSourcePostsCount = await prisma.sourcePost.count({
      where: { accountId: acc.id, status: { in: ["new", "scored"] } }
    });
    console.log(`  SourcePosts: Total ${sourcePostsCount}, New/Scored ${newSourcePostsCount}`);

    const queueItemsCount = await prisma.queueItem.count({
      where: { accountId: acc.id }
    });
    const todayQueueItemsCount = await prisma.queueItem.count({
      where: {
        accountId: acc.id,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      }
    });
    console.log(`  QueueItems: Total ${queueItemsCount}, Today ${todayQueueItemsCount}`);
  }
}

main().catch(console.error);
