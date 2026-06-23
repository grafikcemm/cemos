/**
 * Tek seferlik backfill: kanonik havuzdaki TÜM ContentItem'lar için outlier skoru
 * (creator+format'ı olanlar) + embedding üretir. HTTP/deadline yok → tamamlanır.
 * Çalıştır: npx tsx scripts/ci-backfill.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "@/lib/db/client";
import { scoreOutlier, recomputeBaseline } from "@/lib/content/ingestService";
import { buildSearchableDoc, embedText } from "@/lib/content/search";
import { contentEmbeddingRepo } from "@/lib/db/contentEmbeddingRepo";

const log = (s: string) => process.stdout.write(s + "\n");

async function main() {
  const items = await prisma.contentItem.findMany({
    select: { id: true, creatorId: true, format: true, title: true, body: true, transcript: true, author: true, platform: true },
  });
  log(`toplam içerik: ${items.length}`);

  // Önce TÜM creator+format için baseline (outlier paydası). Aksi halde
  // scoreOutlier baseline bulamaz → insufficient → outlier listesi boş kalır.
  const combos = new Map<string, { creatorId: string; platform: string; format: string }>();
  for (const it of items) {
    if (it.creatorId && it.format) {
      combos.set(`${it.creatorId}:${it.format}`, { creatorId: it.creatorId, platform: it.platform, format: it.format });
    }
  }
  log(`creator+format kombinasyonu: ${combos.size} (baseline hesaplanıyor)`);
  let baselines = 0;
  for (const c of combos.values()) {
    try {
      const b = await recomputeBaseline(c.creatorId, c.platform, c.format);
      if (b.sampleSize >= 3) baselines++;
    } catch (err) {
      log(`  ! baseline ${c.creatorId}/${c.format}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  log(`yeterli örneklemli baseline (≥3): ${baselines}`);

  let scored = 0;
  let embedded = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      if (it.creatorId && it.format) {
        await scoreOutlier(it.id);
        scored++;
      }
      const doc = buildSearchableDoc(it);
      const e = embedText(doc);
      await contentEmbeddingRepo.upsert({
        contentItemId: it.id,
        model: e.model,
        dim: e.dim,
        values: e.values,
        searchableDoc: doc.slice(0, 8000),
      });
      embedded++;
    } catch (err) {
      log(`  ! ${it.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if ((i + 1) % 50 === 0) log(`  ilerleme ${i + 1}/${items.length} (scored=${scored} embedded=${embedded})`);
  }
  log(`\n✓ bitti: scored=${scored} embedded=${embedded}`);
}

main()
  .catch((e) => log("HATA: " + (e instanceof Error ? e.stack : String(e))))
  .finally(async () => prisma.$disconnect());
