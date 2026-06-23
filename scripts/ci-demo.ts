/**
 * Content Intelligence — canlı uçtan-uca demo (Neon'a karşı gerçek repolar).
 * Capture → Understand(outlier) → Discover(semantic) → Save(board) → Adapt(idea)
 * → Create(draft) → Performance(snapshot). Kendi yarattığı satırları sonunda siler.
 * Çalıştır: npx tsx scripts/ci-demo.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";
import { ingestContent, recomputeBaseline, scoreOutlier } from "@/lib/content/ingestService";
import { creatorRepo } from "@/lib/db/creatorRepo";
import { contentItemRepo } from "@/lib/db/contentItemRepo";
import { contentEmbeddingRepo } from "@/lib/db/contentEmbeddingRepo";
import { boardRepo } from "@/lib/db/boardRepo";
import { ideaRepo } from "@/lib/db/ideaRepo";
import { queueRepo } from "@/lib/db/queueRepo";
import { performanceRepo } from "@/lib/db/performanceRepo";
import { buildSearchableDoc, embedText, rankBySimilarity } from "@/lib/content/search";

const log = (s: string) => process.stdout.write(s + "\n");
const created = { items: [] as string[], creator: "", board: "", idea: "", draft: "", published: "" };

/**
 * Neon serverless cold-start retry. The first DB call after idle can time out
 * fetching a pooled connection (P2024) while the compute spins up; retry with
 * backoff so the demo doesn't fail on a transient cold-start (OPS-01).
 */
async function withColdStartRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const delaysMs = [1000, 3000, 6000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delaysMs.length) throw err;
      const wait = delaysMs[attempt];
      log(`   ⏳ ${label} cold-start retry ${attempt + 1}/${delaysMs.length} (${wait}ms): ${err instanceof Error ? err.message.slice(0, 80) : err}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

function docFor(i: number) {
  return buildSearchableDoc({
    title: i === 3 ? "yapay zeka tasarım aracı: figma eklentisi" : `gönderi ${i}`,
    body: i === 3 ? "yeni AI tasarım aracı carousel üretiyor, çok güçlü" : `normal içerik ${i}`,
  });
}

async function main() {
  const acct = (await withColdStartRetry(() => accountRepo.findAll(), "accountRepo.findAll"))[0];
  if (!acct) throw new Error("Hesap yok");
  log(`\n● Hesap: @${acct.handle} (${acct.id})`);

  // 1) CAPTURE + UNDERSTAND — aynı creator+format'tan 4 içerik (baseline için)
  log("\n[1] CAPTURE → kanonik ContentItem (idempotent dedup)");
  const author = "@demo_creator_ci";
  const likeSet = [40, 60, 50, 600]; // son biri outlier
  for (let i = 0; i < likeSet.length; i++) {
    const item = await ingestContent({
      platform: "x",
      externalId: `ci-demo-${i}`,
      sourceType: "external",
      format: "x_single",
      author,
      title: i === 3 ? "yapay zeka tasarım aracı: figma eklentisi" : `gönderi ${i}`,
      body: i === 3 ? "yeni AI tasarım aracı carousel üretiyor, çok güçlü" : `normal içerik ${i}`,
      metrics: { likes: likeSet[i], retweets: 2, views: 1000 },
    });
    created.items.push(item.id);
    log(`   + ${item.platform}/${item.format} likes=${likeSet[i]} → ${item.id}`);
  }
  const again = await ingestContent({ platform: "x", externalId: "ci-demo-0", format: "x_single", author });
  log(`   idempotent re-ingest ci-demo-0 → ${again.id === created.items[0] ? "AYNI satır ✓" : "FARKLI ✗"}`);

  // 2) UNDERSTAND — creator baseline + outlier skoru
  log("\n[2] UNDERSTAND → creator baseline (medyan) + outlier multiplier");
  const creator = await creatorRepo.getByHandle("x", author);
  created.creator = creator!.id;
  const base = await recomputeBaseline(creator!.id, "x", "x_single");
  log(`   baseline medyan=${base.medianValue} örneklem=${base.sampleSize}`);
  const hi = await scoreOutlier(created.items[3]);
  log(`   en yüksek içerik outlier=${hi.multiplier.toFixed(2)}× insufficient=${hi.insufficient}`);

  // 3) DISCOVER — embed + semantik arama
  log("\n[3] DISCOVER → searchable doc + embedding + cosine arama");
  for (const id of created.items) {
    const it = await contentItemRepo.getById(id);
    if (!it) continue;
    const doc = buildSearchableDoc(it);
    const e = embedText(doc);
    await contentEmbeddingRepo.upsert({ contentItemId: id, model: e.model, dim: e.dim, values: e.values, searchableDoc: doc });
  }
  const q = embedText("yapay zeka tasarım aracı").values;
  const cands = created.items.map((id, i) => ({ id, values: embedText(docFor(i)).values }));
  const hits = rankBySimilarity(q, cands, 3);
  log(`   "yapay zeka tasarım aracı" → en iyi eşleşme ${hits[0].id === created.items[3] ? "outlier içerik ✓" : hits[0].id} skor=${hits[0].score.toFixed(3)}`);

  // 4) SAVE — board + save-to-board
  log("\n[4] SAVE → board + içerik kaydet");
  const board = await boardRepo.create({ accountId: acct.id, name: "CI Demo Swipe", icon: "bookmark" });
  created.board = board.id;
  await boardRepo.addItem({ boardId: board.id, contentItemId: created.items[3], itemType: "content" });
  const full = await boardRepo.withItems(board.id);
  log(`   board "${board.name}" item sayısı=${full?.items.length}`);

  // 5) ADAPT — Idea (kaynak provenance ile)
  log("\n[5] ADAPT → Idea (kaynak ContentItem'a bağlı)");
  const idea = await ideaRepo.create({
    accountId: acct.id,
    title: "AI tasarım aracı carousel açısı",
    hook: "Bu AI aracı 10 saniyede carousel üretiyor —",
    angle: "tool_spotlight",
    platform: "x",
    transformationType: "manual",
    sourceContentItemIds: [created.items[3]],
  });
  created.idea = idea.id;
  const ideaFull = await ideaRepo.getById(idea.id);
  log(`   idea "${idea.title}" kaynak=${ideaFull?.sources.length} (provenance ✓)`);

  // 6) CREATE — Idea → Draft (mevcut QueueItem)
  log("\n[6] CREATE → Idea → Draft (QueueItem, insan onayı bekler)");
  const draft = await queueRepo.create({
    accountId: acct.id,
    content: [idea.hook, idea.bodyOutline].filter(Boolean).join("\n"),
    draftType: "TWEET",
    mode: "idea",
    scores: JSON.stringify({ fromIdeaId: idea.id }),
  });
  created.draft = draft.id;
  await ideaRepo.setStatus(idea.id, "drafted");
  log(`   draft ${draft.id} status=${draft.status} (otomatik publish YOK)`);

  // 7) PERFORMANCE — published + snapshot
  log("\n[7] PERFORMANCE → published post + snapshot (24h)");
  const pub = await performanceRepo.createPublished({ accountId: acct.id, content: draft.content, ideaId: idea.id, draftQueueItemId: draft.id });
  created.published = pub.id;
  await performanceRepo.upsertSnapshot({ publishedPostId: pub.id, window: "24h", metrics: { likes: 320, retweets: 41 }, normalizedScore: 0.8 });
  const pubFull = await performanceRepo.getPublished(pub.id);
  log(`   published ${pub.id} snapshot sayısı=${pubFull?.snapshots.length}`);

  log("\n✓ TÜM DÖNGÜ ÇALIŞTI: Capture→Understand→Discover→Save→Adapt→Create→Performance");
}

async function cleanup() {
  log("\n[temizlik] demo satırları siliniyor…");
  try {
    if (created.published) await prisma.performanceSnapshot.deleteMany({ where: { publishedPostId: created.published } });
    if (created.published) await prisma.publishedPost.delete({ where: { id: created.published } });
    if (created.draft) await prisma.queueItem.delete({ where: { id: created.draft } });
    if (created.idea) await prisma.ideaSource.deleteMany({ where: { ideaId: created.idea } });
    if (created.idea) await prisma.idea.delete({ where: { id: created.idea } });
    if (created.board) {
      await prisma.boardItem.deleteMany({ where: { boardId: created.board } });
      await prisma.board.delete({ where: { id: created.board } });
    }
    for (const id of created.items) {
      await prisma.contentEmbedding.deleteMany({ where: { contentItemId: id } });
      await prisma.contentOutlierScore.deleteMany({ where: { contentItemId: id } });
    }
    if (created.items.length) await prisma.contentItem.deleteMany({ where: { id: { in: created.items } } });
    if (created.creator) {
      await prisma.creatorBaseline.deleteMany({ where: { creatorId: created.creator } });
      await prisma.creator.delete({ where: { id: created.creator } });
    }
    log("   temizlendi ✓ (prod'da demo artığı kalmadı)");
  } catch (e) {
    log("   temizlik uyarısı: " + (e instanceof Error ? e.message : String(e)));
  }
}

main()
  .catch((e) => log("HATA: " + (e instanceof Error ? e.stack : String(e))))
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
