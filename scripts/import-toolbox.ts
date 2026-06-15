/**
 * One-shot import: load the old News AI app's toolbox_resources export
 * (src/data/toolbox-resources.json, dumped from its Supabase) into the
 * ToolboxResource table. Upserts by unique url so re-runs are idempotent.
 * The export carries both legacy (name/subcategory/is_favorite) and V5
 * (title/use_case/favorite/status) columns — V5 wins, legacy is the fallback.
 *
 *   npx tsx scripts/import-toolbox.ts          # dry-run (counts + samples)
 *   npx tsx scripts/import-toolbox.ts --commit # write to the DB
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

type LegacyRow = {
  name?: string | null;
  title?: string | null;
  url?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[] | null;
  is_favorite?: boolean | null;
  is_active?: boolean | null;
  resource_type?: string | null;
  platform?: string | null;
  use_case?: string | null;
  why_useful?: string | null;
  x_value_score?: number | null;
  source_reliability?: string | null;
  favorite?: boolean | null;
  archived?: boolean | null;
  status?: string | null;
};

export function mapRow(row: LegacyRow) {
  const title = (row.title || row.name || "").trim();
  const url = (row.url || "").trim();
  if (!title || !url) return null;

  const isActive =
    row.status != null ? row.status === "active"
    : row.archived != null ? !row.archived
    : row.is_active ?? true;

  return {
    title,
    url,
    resourceType: row.resource_type || "tool",
    category: row.category || "general",
    platform: row.platform ?? null,
    useCase: row.use_case || row.subcategory || null,
    description: row.description || "",
    whyUseful: row.why_useful ?? null,
    tags: JSON.stringify(row.tags ?? []),
    xValueScore: row.x_value_score ?? 0,
    sourceReliability: row.source_reliability || "medium",
    isFavorite: row.favorite ?? row.is_favorite ?? false,
    isActive,
  };
}

async function main() {
  const jsonPath = join(process.cwd(), "src", "data", "toolbox-resources.json");
  const rows: LegacyRow[] = JSON.parse(readFileSync(jsonPath, "utf8"));

  const mapped = rows.map(mapRow).filter((r): r is NonNullable<ReturnType<typeof mapRow>> => r !== null);
  // Same-url rows: last one wins (matches upsert semantics, keeps run deterministic).
  const byUrl = new Map(mapped.map((r) => [r.url, r]));

  console.log(`Kaynak dosya: ${rows.length} satır, geçerli: ${mapped.length}, benzersiz url: ${byUrl.size}`);
  for (const r of [...byUrl.values()].slice(0, 5)) {
    console.log(`~ ${r.title} [${r.category}] fav=${r.isFavorite} ${r.url}`);
  }

  if (!COMMIT) {
    console.log("\nDRY-RUN — yazmak için --commit geçin.");
    return;
  }

  let created = 0;
  let updated = 0;
  for (const data of byUrl.values()) {
    const existing = await prisma.toolboxResource.findUnique({ where: { url: data.url } });
    await prisma.toolboxResource.upsert({
      where: { url: data.url },
      create: data,
      update: data,
    });
    if (existing) updated++;
    else created++;
  }
  console.log(`\n✅ ${created} yeni, ${updated} güncellenen kayıt.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
