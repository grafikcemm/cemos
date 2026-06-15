/**
 * One-shot backfill: archive already-analyzed NewsItems whose xValueScore is
 * below LOW_SCORE_THRESHOLD as "low_score". New analyses get this status in
 * the pipeline; this script migrates the rows scored before the rule existed.
 * Rows are kept (NOT deleted) so the url-unique dedup keeps blocking
 * re-fetch → re-translate → re-analyze LLM spend on the same story.
 *
 *   npx tsx scripts/archive-low-score.ts          # dry-run (counts + samples)
 *   npx tsx scripts/archive-low-score.ts --commit # apply the archive
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "../src/generated/prisma/client";
import { LOW_SCORE_THRESHOLD } from "../src/lib/news/pipeline";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

async function main() {
  const candidates = await prisma.newsItem.findMany({
    where: {
      processingStatus: "analyzed",
      xValueScore: { not: null, lt: LOW_SCORE_THRESHOLD },
    },
    select: { id: true, xValueScore: true, trTitle: true, originalTitle: true },
    orderBy: { xValueScore: "asc" },
  });

  console.log(`Eşik: xValueScore < ${LOW_SCORE_THRESHOLD}`);
  console.log(`Arşivlenecek aday: ${candidates.length}`);
  for (const item of candidates.slice(0, 5)) {
    console.log(`~ ${item.id} [skor ${item.xValueScore}] ${(item.trTitle || item.originalTitle).slice(0, 80)}`);
  }

  if (!COMMIT) {
    console.log("\nDRY-RUN — yazmak için --commit geçin.");
    return;
  }

  let updated = 0;
  for (const item of candidates) {
    await prisma.newsItem.update({
      where: { id: item.id },
      data: {
        processingStatus: "low_score",
        errorMessage: `Düşük skor: ${item.xValueScore} < ${LOW_SCORE_THRESHOLD} — arşivlendi`,
      },
    });
    updated++;
  }
  console.log(`\n✅ ${updated} kayıt low_score olarak arşivlendi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
