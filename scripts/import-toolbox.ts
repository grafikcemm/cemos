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

// Neon serverless auto-suspends; the first connect after idle can exceed the
// default 10s pool/connect timeout (P2024 / init timeout). Bump both.
const rawUrl = process.env.DATABASE_URL ?? "";
const tunedUrl = rawUrl
  ? rawUrl + (rawUrl.includes("?") ? "&" : "?") + "connect_timeout=30&pool_timeout=30"
  : rawUrl;
const prisma = tunedUrl ? new PrismaClient({ datasourceUrl: tunedUrl }) : new PrismaClient();
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

  // Chunked $transaction: 1 connection acquisition per chunk instead of one
  // per row. Neon serverless pools time out (P2024) under per-row round-trips.
  const all = [...byUrl.values()];
  const CHUNK = 25;
  let done = 0;
  for (let i = 0; i < all.length; i += CHUNK) {
    const slice = all.slice(i, i + CHUNK);
    await prisma.$transaction(
      slice.map((data) =>
        prisma.toolboxResource.upsert({ where: { url: data.url }, create: data, update: data })
      )
    );
    done += slice.length;
    console.log(`  ${done}/${all.length} upsert…`);
  }
  console.log(`\n✅ ${done} kayıt upsert edildi (yeni + güncellenen).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
