/**
 * AI Sıralama seed (W6a): statik model sıralamasını (src/data/ai-models-rankings.json)
 * bugünün tarihiyle Prisma `AiModelSnapshot` tablosuna idempotent upsert eder.
 * UI: `/api/ai-rankings` en güncel snapshot'ı döndürür → AiRankingsTab.
 *
 * Idempotent: snapshotDate (YYYY-MM-DD, Europe/Istanbul) bazlı upsert — gün içinde re-run no-op/güncelleme.
 *
 *   npx tsx scripts/seed-ai-rankings.ts            # kuru çalışma
 *   npx tsx scripts/seed-ai-rankings.ts --commit    # DB'ye yazar
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/db/client";

const COMMIT = process.argv.includes("--commit");
const DATA_PATH = resolve(process.cwd(), "src/data/ai-models-rankings.json");

type RankingRow = {
  rank: number;
  model: string;
  provider: string;
  score: number;
  bestFor: string;
};

type RankingsFile = {
  source?: string;
  rankings: RankingRow[];
};

function todayInIstanbul(): string {
  // YYYY-MM-DD, Europe/Istanbul (sv-SE locale → ISO benzeri tarih)
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main() {
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as RankingsFile;
  const rankings = raw.rankings ?? [];
  const source = raw.source ?? "static";
  const snapshotDate = todayInIstanbul();

  console.log(`AI rankings seed | ${COMMIT ? "COMMIT" : "DRY-RUN"} | date=${snapshotDate} | source=${source} | rows=${rankings.length}`);

  if (rankings.length === 0) throw new Error("rankings boş — veri dosyasını kontrol et.");

  if (!COMMIT) {
    console.log("İlk 3:", rankings.slice(0, 3).map((r) => `#${r.rank} ${r.model}`).join(" | "));
    console.log("Yazmak için --commit geçin.");
    return;
  }

  const rankingsJson = JSON.stringify(rankings);
  const existing = await prisma.aiModelSnapshot.findUnique({ where: { snapshotDate }, select: { id: true } });
  await prisma.aiModelSnapshot.upsert({
    where: { snapshotDate },
    create: { snapshotDate, rankingsJson, source },
    update: { rankingsJson, source },
  });

  console.log(`✅ ${existing ? "güncellendi" : "oluşturuldu"} | snapshot ${snapshotDate} | ${rankings.length} model`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
