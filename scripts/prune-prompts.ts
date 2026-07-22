/**
 * Prompt Kütüphanesi budama: mevcut PromptTemplate tablosunu (~300 satır)
 * "nokta atışı işe yarar" çekirdeğe indirir. import-prompts.ts harici JSON'dan
 * EKLER; bu script mevcut DB'yi BUDAR (siler).
 *
 * Mantık:
 *   1. Tüm satırları .tmp/prompts-backup-<ts>.json'a yedekle (geri yükleme güvencesi).
 *   2. Domain-relevance skorla — Ali Cem'in işine (tasarım, UI/UX, sosyal medya,
 *      X/Twitter, içerik, marka/logo, reklam, AI görsel/video, Instagram, YouTube)
 *      değen promptlar puan alır; değmeyenler elenir.
 *   3. Yakın-benzer dedup (title+useCase token Jaccard ≥ SIM) — biri kalır.
 *   4. En iyi TARGET (~60) tut: (relevance skoru, sonra metin uzunluğu = spesifiklik).
 *   5. --commit ile gerisini sil.
 *
 *   npx tsx scripts/prune-prompts.ts                 # kuru çalışma (ne kalır/silinir)
 *   npx tsx scripts/prune-prompts.ts --commit         # yedekle + sil
 *   npx tsx scripts/prune-prompts.ts --target=80 --sim=0.8
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/db/client";

const COMMIT = process.argv.includes("--commit");

function argValue(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

const TARGET = Number(argValue("target") ?? 60);
const SIM_THRESHOLD = Number(argValue("sim") ?? 0.85);
const BACKUP_TS = argValue("ts") ?? "manual";

// Kategori ağırlığı PRİMER sinyal — Ali Cem tasarımcı + sosyal medya üreticisi.
// Tasarım/İçerik kategorileri yukarı; kod/sistem/persona promptları işine
// nadiren yarar, aşağı. (Anahtar kelime taraması tek başına ayırt edemiyordu:
// promptText'te "ai/ui/script" her yerde geçtiği için hepsi eşit puan alıyordu.)
const CATEGORY_WEIGHT: Record<string, number> = {
  "Tasarım & Görsel": 12,
  "Yazma & İçerik Üretimi": 10,
  "İş & Strateji": 5,
  "Kişisel Gelişim": 4,
  "Analiz & Araştırma": 2,
  "Verimlilik & Zaman Yönetimi": 1,
  "Eğitim & Öğrenme": 1,
  "Kod & Teknik": 1,
  "Sistem Promptları & Persona": -2,
};
const DEFAULT_CATEGORY_WEIGHT = 2;

// Bonus: SADECE amaç alanlarında (title/useCase/tags) kelime eşleşmesi —
// promptText taranmaz (gövdedeki teknik jargon yanlış pozitif üretiyordu).
const BONUS_KEYWORDS: string[] = [
  "tasarim", "design", "grafik", "ui", "ux", "figma", "mockup", "banner", "afis", "poster",
  "marka", "logo", "brand", "kurumsal", "kimlik",
  "sosyal", "social", "instagram", "twitter", "tweet", "thread", "reels", "story",
  "icerik", "content", "caption", "baslik", "hook", "copy",
  "reklam", "ads", "kampanya", "pazarlama", "marketing",
  "midjourney", "gorsel", "thumbnail",
];

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

type Row = {
  id: string;
  slug: string;
  title: string;
  category: string;
  useCase: string | null;
  promptText: string;
  tags: string;
  source: string;
  createdAt: Date;
};

function relevanceScore(r: Row): number {
  // Category is the primary signal.
  const score = CATEGORY_WEIGHT[r.category] ?? DEFAULT_CATEGORY_WEIGHT;
  // Purpose-field keyword bonus (NOT promptText). Word-set membership avoids
  // substring false positives ("ai" inside unrelated words).
  const purposeTokens = tokenize(`${r.title} ${r.useCase ?? ""} ${r.tags}`);
  let bonus = 0;
  for (const kw of BONUS_KEYWORDS) {
    if (purposeTokens.has(normalizeText(kw))) bonus += 2;
  }
  return score + Math.min(bonus, 8); // bonus cap so one prompt can't dominate
}

async function main() {
  console.log(`Prompt prune | ${COMMIT ? "COMMIT" : "DRY-RUN"} | target=${TARGET} sim=${SIM_THRESHOLD}`);

  const rows = (await prisma.promptTemplate.findMany({
    orderBy: { createdAt: "asc" },
  })) as Row[];
  console.log(`mevcut: ${rows.length} prompt`);

  // 1. Yedek (her zaman, dry-run'da da — güvenli).
  const tmpDir = resolve(process.cwd(), ".tmp");
  mkdirSync(tmpDir, { recursive: true });
  const backupPath = resolve(tmpDir, `prompts-backup-${BACKUP_TS}.json`);
  writeFileSync(backupPath, JSON.stringify(rows, null, 2), "utf-8");
  console.log(`yedek: ${backupPath}`);

  // 2. Relevance skorla + alakasızları ele.
  const scored = rows
    .map((r) => ({ row: r, score: relevanceScore(r), tokens: tokenize(`${r.title} ${r.useCase ?? ""}`) }))
    .filter((s) => s.score > 0);
  const droppedIrrelevant = rows.length - scored.length;

  // 3. En iyiden başla, yakın-benzerleri ele (greedy).
  scored.sort((a, b) => b.score - a.score || b.row.promptText.length - a.row.promptText.length);
  const kept: typeof scored = [];
  let droppedDup = 0;
  for (const s of scored) {
    const dup = kept.some(
      (k) => k.row.category === s.row.category && jaccard(s.tokens, k.tokens) >= SIM_THRESHOLD
    );
    if (dup) droppedDup++;
    else kept.push(s);
  }

  // 4. TARGET'a indir — kategori-başına yumuşak cap ile çeşitlilik koru
  // (yoksa "Tasarım & Görsel" tek başına 60'ı doldurup içerik/strateji
  // promptlarını dışlıyordu). Önce cap'lere uy, sonra boşluk kalırsa cap'siz
  // doldur.
  const CATEGORY_CAP: Record<string, number> = {
    "Tasarım & Görsel": 28,
    "Yazma & İçerik Üretimi": 18,
    "İş & Strateji": 6,
    "Kişisel Gelişim": 4,
  };
  const DEFAULT_CAP = 2;
  const perCat: Record<string, number> = {};
  const final: typeof kept = [];
  for (const s of kept) {
    if (final.length >= TARGET) break;
    const cap = CATEGORY_CAP[s.row.category] ?? DEFAULT_CAP;
    if ((perCat[s.row.category] ?? 0) >= cap) continue;
    perCat[s.row.category] = (perCat[s.row.category] ?? 0) + 1;
    final.push(s);
  }
  // Cap'ler yüzünden hedefin altında kaldıysak, kalan en yüksek skorlularla doldur.
  if (final.length < TARGET) {
    const chosen = new Set(final.map((s) => s.row.id));
    for (const s of kept) {
      if (final.length >= TARGET) break;
      if (!chosen.has(s.row.id)) final.push(s);
    }
  }
  const overflow = kept.length - final.length;
  const keepIds = new Set(final.map((s) => s.row.id));
  const deleteIds = rows.filter((r) => !keepIds.has(r.id)).map((r) => r.id);

  const catDist: Record<string, number> = {};
  for (const s of final) catDist[s.row.category] = (catDist[s.row.category] || 0) + 1;

  console.log(
    `\nalakasız elenen: -${droppedIrrelevant} | yakın-benzer elenen: -${droppedDup} | ` +
      `target taşan: -${overflow} | KALAN: ${final.length} | SİLİNECEK: ${deleteIds.length}`
  );
  console.log("kalan kategori dağılımı:", JSON.stringify(catDist));
  console.log("\nKalan ilk 10:");
  for (const s of final.slice(0, 10)) {
    console.log(`  - [${s.row.category}] ${s.row.title} (skor ${s.score})`);
  }

  if (!COMMIT) {
    console.log("\nSilmek için --commit geçin (yedek zaten alındı).");
    return;
  }

  if (deleteIds.length === 0) {
    console.log("\nSilinecek satır yok.");
    return;
  }

  const res = await prisma.promptTemplate.deleteMany({ where: { id: { in: deleteIds } } });
  const after = await prisma.promptTemplate.count();
  console.log(`\n✅ silindi: ${res.count} | kalan tablo: ${after}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
