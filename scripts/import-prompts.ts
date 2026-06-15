/**
 * Prompt Kütüphanesi import (W2): sibling `grafikcem-news-ai` prompt veri setini
 * (meta + texts) kalite filtresi + yakın-benzer dedup ile Prisma `PromptTemplate`
 * tablosuna idempotent yazar.
 *
 * Kaynak (varsayılan, override: --meta= / --texts=):
 *   ../grafikcem-news-ai/src/data/prompts_meta.json   (dizi: id, title_tr, category, tags[], description_tr, use_case_tr, quality_score, ...)
 *   ../grafikcem-news-ai/src/data/prompts_texts.json   ({ id: tam_prompt_metni })
 *
 * Dedup:
 *   (a) normalize edilmiş title_tr birebir çakışma → en yüksek quality_score'lu temsilci kalır.
 *   (b) yakın-benzer: normalize(title_tr + " " + description_tr) token Jaccard ≥ SIM_THRESHOLD → kümele, en iyi temsilci kalır.
 * Kalite filtresi: quality_score >= QUALITY_MIN (vars. 6) + promptText >= MIN_TEXT_LEN.
 * Idempotent: slug (title_tr → kebab) bazlı upsert; deterministik → re-run duplicate üretmez.
 *
 *   npx tsx scripts/import-prompts.ts            # kuru çalışma (sayıları listeler)
 *   npx tsx scripts/import-prompts.ts --count    # aynı (kuru)
 *   npx tsx scripts/import-prompts.ts --commit    # DB'ye yazar
 *   npx tsx scripts/import-prompts.ts --commit --min=7   # eşik override
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/db/client";

const COMMIT = process.argv.includes("--commit");
const SOURCE = "grafikcem-news-ai";

function argValue(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

const QUALITY_MIN = Number(argValue("min") ?? 6);
const SIM_THRESHOLD = Number(argValue("sim") ?? 0.85);
const MIN_TEXT_LEN = 40;

const DEFAULT_META = resolve(process.cwd(), "../grafikcem-news-ai/src/data/prompts_meta.json");
const DEFAULT_TEXTS = resolve(process.cwd(), "../grafikcem-news-ai/src/data/prompts_texts.json");
const META_PATH = argValue("meta") ?? DEFAULT_META;
const TEXTS_PATH = argValue("texts") ?? DEFAULT_TEXTS;

type PromptMeta = {
  id: string;
  title_tr?: string;
  title_original?: string;
  category?: string;
  tags?: string[];
  description_tr?: string;
  use_case_tr?: string;
  quality_score?: number;
};

type Candidate = {
  id: string;
  title: string;
  category: string;
  useCase: string | null;
  promptText: string;
  tags: string[];
  quality: number;
  dedupKey: string; // normalize(title + " " + description) — token kaynağı
  tokens: Set<string>;
};

const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
};

function transliterate(s: string): string {
  return s.replace(/[çğıöşüÇĞİIÖŞÜ]/g, (c) => TR_MAP[c] ?? c);
}

function normalizeText(s: string): string {
  return transliterate(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  return new Set(normalizeText(s).split(" ").filter((t) => t.length >= 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function slugify(title: string): string {
  const base = normalizeText(title).replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return base || "prompt";
}

function loadCandidates(): { read: number; afterQuality: Candidate[] } {
  const metaRaw = JSON.parse(readFileSync(META_PATH, "utf-8")) as PromptMeta[];
  const textsRaw = JSON.parse(readFileSync(TEXTS_PATH, "utf-8")) as Record<string, string>;

  const afterQuality: Candidate[] = [];
  for (const m of metaRaw) {
    const title = (m.title_tr || m.title_original || "").trim();
    const promptText = (textsRaw[m.id] || "").trim();
    const quality = m.quality_score ?? 0;
    if (!title) continue;
    if (quality < QUALITY_MIN) continue;
    if (promptText.length < MIN_TEXT_LEN) continue;

    const desc = (m.description_tr || "").trim();
    const dedupKey = `${title} ${desc}`;
    afterQuality.push({
      id: m.id,
      title,
      category: (m.category || "Diğer").trim() || "Diğer",
      useCase: (m.use_case_tr || "").trim() || null,
      promptText,
      tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === "string" && t.trim()) : [],
      quality,
      dedupKey,
      tokens: tokenize(dedupKey),
    });
  }
  return { read: metaRaw.length, afterQuality };
}

function dedupe(cands: Candidate[]): { kept: Candidate[]; exactDropped: number; nearDropped: number } {
  // (a) normalize title birebir → küme, en iyi quality temsilci
  const byTitle = new Map<string, Candidate>();
  let exactDropped = 0;
  for (const c of cands) {
    const key = normalizeText(c.title);
    const prev = byTitle.get(key);
    if (!prev) {
      byTitle.set(key, c);
    } else {
      exactDropped++;
      if (c.quality > prev.quality) byTitle.set(key, c);
    }
  }
  // yüksek kaliteden düşüğe — temsilciler yüksek kaliteli olsun
  const stage1 = [...byTitle.values()].sort((a, b) => b.quality - a.quality);

  // (b) yakın-benzer Jaccard → greedy küme
  const kept: Candidate[] = [];
  let nearDropped = 0;
  for (const c of stage1) {
    let dup = false;
    for (const k of kept) {
      if (c.category !== k.category) continue; // kategori-içi benzerlik (yanlış pozitif azalt)
      if (jaccard(c.tokens, k.tokens) >= SIM_THRESHOLD) {
        dup = true;
        break;
      }
    }
    if (dup) nearDropped++;
    else kept.push(c);
  }
  return { kept, exactDropped, nearDropped };
}

function assignSlugs(kept: Candidate[]): Array<Candidate & { slug: string }> {
  const used = new Set<string>();
  return kept.map((c) => {
    const base = slugify(c.title);
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return { ...c, slug };
  });
}

async function main() {
  console.log(`Prompt import | ${COMMIT ? "COMMIT" : "DRY-RUN"} | min=${QUALITY_MIN} sim=${SIM_THRESHOLD}`);
  console.log(`  meta : ${META_PATH}`);
  console.log(`  texts: ${TEXTS_PATH}`);

  const { read, afterQuality } = loadCandidates();
  const { kept, exactDropped, nearDropped } = dedupe(afterQuality);
  const withSlugs = assignSlugs(kept);

  console.log(
    `\nokunan: ${read} | kalite(>=${QUALITY_MIN})+metin sonrası: ${afterQuality.length} | ` +
      `birebir dedup: -${exactDropped} | yakın-benzer dedup: -${nearDropped} | yazılacak: ${withSlugs.length}`
  );

  // kategori dağılımı (UI dropdown doğrulaması)
  const catDist: Record<string, number> = {};
  for (const c of withSlugs) catDist[c.category] = (catDist[c.category] || 0) + 1;
  console.log("kategori dağılımı:", JSON.stringify(catDist));

  if (!COMMIT) {
    console.log("\nİlk 5 örnek:");
    for (const c of withSlugs.slice(0, 5)) {
      console.log(`  - [${c.category}] ${c.title} (q${c.quality}) → ${c.slug}`);
    }
    console.log("\nYazmak için --commit geçin.");
    return;
  }

  const before = await prisma.promptTemplate.count();
  let done = 0;
  for (const c of withSlugs) {
    await prisma.promptTemplate.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        title: c.title,
        category: c.category,
        useCase: c.useCase,
        promptText: c.promptText,
        lang: "tr",
        tags: JSON.stringify(c.tags),
        source: SOURCE,
      },
      update: {
        title: c.title,
        category: c.category,
        useCase: c.useCase,
        promptText: c.promptText,
        tags: JSON.stringify(c.tags),
        source: SOURCE,
      },
    });
    done++;
    if (done % 100 === 0) console.log(`  ...${done}/${withSlugs.length}`);
  }
  const after = await prisma.promptTemplate.count();

  console.log(`\n✅ yazıldı | toplam tablo: ${before} → ${after} | upsert: ${withSlugs.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
