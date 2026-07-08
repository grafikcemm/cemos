/**
 * Eval golden set seed'i (FIRST-SPRINT item 19).
 *
 *   npx tsx scripts/seed-eval-golden.ts
 *
 * `src/lib/eval/goldenSet.ts` içindeki kürasyonlu vakaları (hesap başına
 * bilinen-iyi generation + bilinen-iyi/kötü score_direct; toplam ≥40)
 * EvalTest tablosuna yazar. Idempotent: testName üzerinden mevcut kayıt
 * atlanır — tekrar koşmak duplicate üretmez, LLM harcaması yoktur.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../src/lib/db/client";
import { buildGoldenSeedCases } from "../src/lib/eval/goldenSet";

async function main() {
  const cases = buildGoldenSeedCases();
  console.log(`Golden set: ${cases.length} vaka hazırlanıyor...`);

  const accounts = await prisma.account.findMany({
    where: { handle: { in: ["grafikcem", "maskulenkod"] } },
    select: { id: true, handle: true },
  });
  const idByHandle = new Map(accounts.map((a) => [a.handle, a.id]));

  let created = 0;
  let skipped = 0;
  let missingAccount = 0;

  for (const c of cases) {
    const accountId = idByHandle.get(c.accountHandle);
    if (!accountId) {
      missingAccount++;
      continue;
    }

    const existing = await prisma.evalTest.findFirst({
      where: { accountId, testName: c.testName },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.evalTest.create({
      data: {
        accountId,
        testName: c.testName,
        sourceContent: c.sourceContent,
        expectedBehavior: c.expectedBehavior,
        platform: "x",
      },
    });
    created++;
  }

  console.log(
    `Golden set seed tamam: ${created} yeni, ${skipped} mevcut (atlandı)` +
      (missingAccount ? `, ${missingAccount} hesap bulunamadı` : ""),
  );
  const total = await prisma.evalTest.count({ where: { testName: { startsWith: "golden:" } } });
  console.log(`DB'deki golden vaka toplamı: ${total} (hedef ≥40)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
