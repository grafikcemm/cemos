/**
 * AI Sıralama canlı güncelleme (manuel/tetiklemeli). Üç public leaderboard'u
 * çekip LLM ile normalize eder ve bugünün AiModelSnapshot satırına yazar.
 * seed-ai-rankings.ts statik JSON'u yazar; bu script CANLI kaynaklardan çeker.
 *
 *   npx tsx scripts/refresh-ai-rankings.ts
 *
 * Not: kaynaklar JS-SPA ise sunucu fetch yetersiz kalabilir; servis bu durumda
 * mevcut snapshot'a dokunmaz (graceful fallback). OPENROUTER_API_KEY gerekir.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { refreshRankings } from "../src/lib/services/aiRankingsService";
import { prisma } from "../src/lib/db/client";

async function main() {
  console.log("AI rankings refresh | canlı kaynaklardan çekiliyor…");
  const result = await refreshRankings();
  if (result.ok) {
    console.log(`✅ güncellendi | ${result.snapshotDate} | ${result.count} model | source=${result.source}`);
  } else {
    console.log(`⚠️ güncelleme atlandı | sebep=${result.reason} | source=${result.source} | count=${result.count}`);
    console.log("Mevcut snapshot korundu (statik seed dahil).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
