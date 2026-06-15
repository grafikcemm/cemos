/**
 * One-shot backfill: re-clean NewsItem originalTitle/originalSummary that were
 * inserted before the pipeline's entity/mojibake cleaning existed. Targets
 * rows containing mojibake markers, numeric entities or raw HTML tags.
 *
 *   npx tsx scripts/clean-news-text.ts          # dry-run (show counts + samples)
 *   npx tsx scripts/clean-news-text.ts --commit # rewrite the dirty rows
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "../src/generated/prisma/client";
import { cleanNewsText } from "../src/lib/news/pipeline";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const DIRTY = /[ÃÂ]|â€|Ä.|Å.|&#|&[a-z]+;|<[a-z][^>]*>/i;

async function main() {
  const items = await prisma.newsItem.findMany({
    select: { id: true, originalTitle: true, originalSummary: true, trTitle: true, trSummary: true, errorMessage: true },
  });

  let dirty = 0;
  let updated = 0;
  for (const item of items) {
    const fields = {
      originalTitle: item.originalTitle,
      originalSummary: item.originalSummary ?? "",
      trTitle: item.trTitle ?? "",
      trSummary: item.trSummary ?? "",
      errorMessage: item.errorMessage ?? "",
    };
    const cleaned: Record<string, string> = {};
    let changed = false;
    for (const [key, value] of Object.entries(fields)) {
      if (!value || !DIRTY.test(value)) continue;
      const next = cleanNewsText(value);
      if (next !== value) {
        cleaned[key] = next;
        changed = true;
      }
    }
    if (!changed) continue;
    dirty++;

    if (dirty <= 5) {
      const sampleKey = Object.keys(cleaned)[0];
      console.log(`~ ${item.id} [${sampleKey}]`);
      console.log(`  önce : ${(fields as Record<string, string>)[sampleKey].slice(0, 120)}`);
      console.log(`  sonra: ${cleaned[sampleKey].slice(0, 120)}`);
    }

    if (COMMIT) {
      await prisma.newsItem.update({ where: { id: item.id }, data: cleaned });
      updated++;
    }
  }

  console.log(`\nToplam ${items.length} kayıt tarandı, ${dirty} kirli kayıt bulundu.`);
  console.log(COMMIT ? `✅ ${updated} kayıt güncellendi.` : "DRY-RUN — yazmak için --commit geçin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
