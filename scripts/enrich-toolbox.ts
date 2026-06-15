/**
 * One-shot LLM enrichment: fill the empty platform/useCase/contentFormat/
 * sourceReliability/xValueScore columns on ToolboxResource rows. Idempotent —
 * rows that already carry platform + useCase are skipped, so a re-run only
 * touches new/unenriched records and stays cheap.
 *
 * Budget is gated IN-SCRIPT (no costGate.ts dependency): the accumulated
 * estimatedCostUsd is compared against TOOLBOX_ENRICH_BUDGET_USD (default 1.5)
 * and the loop stops cleanly once exceeded, logging how many rows were left.
 *
 *   npx tsx scripts/enrich-toolbox.ts          # dry-run (samples + cost estimate)
 *   npx tsx scripts/enrich-toolbox.ts --commit # write enriched fields to the DB
 *
 * Requires OPENROUTER_API_KEY. Without it the LLM call throws and the script
 * exits — schema/import/UI work independently of this step. Pure mapping logic
 * lives in src/lib/toolbox/enrichToolbox.ts (unit-tested separately).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "../src/generated/prisma/client";
import { generateJson } from "../src/lib/ai/openrouter";
import { applyEnrichment, buildEnrichPrompt } from "../src/lib/toolbox/enrichToolbox";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const BATCH_SIZE = 10;
const DEFAULT_BUDGET_USD = 1.5;

async function main() {
  const budgetUsd = Number(process.env.TOOLBOX_ENRICH_BUDGET_USD ?? DEFAULT_BUDGET_USD);

  // Unenriched = missing platform OR useCase. Active rows only.
  const pending = await prisma.toolboxResource.findMany({
    where: { isActive: true, OR: [{ platform: null }, { useCase: null }] },
    orderBy: { createdAt: "desc" },
  });

  console.log(
    `Zenginleştirilecek: ${pending.length} kaynak | bütçe: $${budgetUsd.toFixed(2)} | ${COMMIT ? "COMMIT" : "DRY-RUN"}`
  );
  if (pending.length === 0) {
    console.log("Hepsi zaten zenginleştirilmiş — iş yok.");
    return;
  }

  let spentUsd = 0;
  let enriched = 0;
  let skipped = 0;
  let processed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      if (spentUsd >= budgetUsd) {
        const left = pending.length - processed;
        console.log(`\n⚠ Bütçe doldu ($${spentUsd.toFixed(4)} / $${budgetUsd.toFixed(2)}). ${left} kaynak işlenmedi.`);
        finish(enriched, skipped, spentUsd);
        return;
      }
      processed++;
      try {
        const { system, user } = buildEnrichPrompt(row);
        const res = await generateJson<unknown>({ role: "cheapWriter", system, user, temperature: 0.3 });
        spentUsd += res.estimatedCostUsd;

        const result = applyEnrichment(res.data);
        if (!result) {
          skipped++;
          console.log(`~ atlandı (geçersiz LLM çıktısı): ${row.title}`);
          continue;
        }

        if (COMMIT) {
          await prisma.toolboxResource.update({ where: { id: row.id }, data: result });
        } else {
          console.log(`~ ${row.title} → ${result.platform}/${result.useCase} skor=${result.xValueScore}`);
        }
        enriched++;
      } catch (err) {
        skipped++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`~ HATA ${row.title}: ${msg}`);
      }
    }
  }

  finish(enriched, skipped, spentUsd);
}

function finish(enriched: number, skipped: number, spentUsd: number) {
  console.log(
    `\n${COMMIT ? "✅" : "DRY-RUN"} ${enriched} zenginleştirildi, ${skipped} atlandı, tahmini $${spentUsd.toFixed(4)} harcandı.`
  );
  if (!COMMIT) console.log("Yazmak için --commit geçin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
