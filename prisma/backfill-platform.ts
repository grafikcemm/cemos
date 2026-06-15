/**
 * One-time, idempotent platform backfill (Faz F — cross-platform learning).
 * Labels HISTORICAL TrainingExample & ViralPattern rows (created before the
 * platform column existed) with their owning platform. New rows are labeled on
 * write by the repos (see platformDerive.ts).
 *
 * Run manually (does NOT run automatically):
 *   npx tsx prisma/backfill-platform.ts
 *
 * Idempotent: every updateMany is guarded by `platform: "x"` (the column
 * default), so once a row is relabeled a second run cannot touch it again —
 * re-running is a safe no-op. The mapping mirrors platformDerive.ts exactly:
 *   TrainingExample.inputType  yt_ -> youtube, ig_ -> instagram, else x
 *   ViralPattern.sourceType    yt or youtube -> youtube, ig or instagram -> instagram
 */
import { PrismaClient } from "../src/generated/prisma/client";

// Minimal structural client so a unit test can inject a mock without the full
// PrismaClient surface. The real client satisfies it.
export type BackfillClient = {
  trainingExample: {
    updateMany(args: { where: Record<string, unknown>; data: { platform: string } }): Promise<{ count: number }>;
  };
  viralPattern: {
    updateMany(args: { where: Record<string, unknown>; data: { platform: string } }): Promise<{ count: number }>;
  };
};

export type BackfillResult = {
  trainingYoutube: number;
  trainingInstagram: number;
  viralYoutube: number;
  viralInstagram: number;
};

export async function backfillPlatform(client: BackfillClient): Promise<BackfillResult> {
  const teYoutube = await client.trainingExample.updateMany({
    where: { platform: "x", inputType: { startsWith: "yt_" } },
    data: { platform: "youtube" },
  });
  const teInstagram = await client.trainingExample.updateMany({
    where: { platform: "x", inputType: { startsWith: "ig_" } },
    data: { platform: "instagram" },
  });

  // sourceType "youtube" does NOT start with "yt", so match both forms.
  const vpYoutube = await client.viralPattern.updateMany({
    where: { platform: "x", OR: [{ sourceType: { startsWith: "yt" } }, { sourceType: "youtube" }] },
    data: { platform: "youtube" },
  });
  const vpInstagram = await client.viralPattern.updateMany({
    where: { platform: "x", OR: [{ sourceType: { startsWith: "ig" } }, { sourceType: "instagram" }] },
    data: { platform: "instagram" },
  });

  return {
    trainingYoutube: teYoutube.count,
    trainingInstagram: teInstagram.count,
    viralYoutube: vpYoutube.count,
    viralInstagram: vpInstagram.count,
  };
}

// Auto-run only when invoked directly (tsx), never on import (keeps the test pure).
const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/backfill-platform.ts");
if (invokedDirectly) {
  const prisma = new PrismaClient();
  backfillPlatform(prisma)
    .then((r) => {
      console.log("Platform backfill tamamlandı:");
      console.log(`  TrainingExample -> youtube: ${r.trainingYoutube}, instagram: ${r.trainingInstagram}`);
      console.log(`  ViralPattern    -> youtube: ${r.viralYoutube}, instagram: ${r.viralInstagram}`);
      return prisma.$disconnect();
    })
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("Platform backfill hatası:", err);
      await prisma.$disconnect().catch(() => {});
      process.exit(1);
    });
}
