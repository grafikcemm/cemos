/**
 * verify:acceptance — STATİK kabul sözleşmesi doğrulaması (Phase 5E).
 *
 * Amaç: mekanik olarak doğrulanabilen, drift'e açık sözleşmeleri CI'da sabitle.
 * DÜRÜSTLÜK: bu script auth'un ÇALIŞTIĞINI, entegrasyonların CANLI olduğunu veya
 * testlerin GEÇTİĞİNİ İDDİA ETMEZ — yalnız statik yapısal tutarlılığı kontrol eder.
 * Runtime/liveness/auth doğrulaması ayrı katmanlarda (unit/e2e/health).
 *
 * Kontroller:
 *  1. Her nav tab id'sinin screenRegistry render case'i var (nav → boş ekran yok).
 *  2. Her TAB_ALIASES hedefi gerçek bir render case'e çözülür + alias anahtarı
 *     canlı bir tab id'sini GÖLGELEMEZ (invariant).
 *  3. Her render case nav/alias ile erişilebilir (orphan ekran uyarısı).
 *  4. vercel.json cron path'lerinin route dosyası var (kırık cron yok).
 *  5. P0 BACKSTOP: her mutation route (POST/PATCH/PUT/DELETE) bir guard'a
 *     (isOperatorOrCronAuthorized | isCronAuthorized) referans verir (auth/* hariç).
 *
 * Manifest istisnaları (bilinçli — flag DEĞİL): dış/MCP + programatik sözleşmeler.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import {
  TAB_ALIASES,
  normalizeTabId,
  allNavigableTabs,
} from "../src/components/nav/navConfig";

const root = process.cwd();
const errors: string[] = [];
const notes: string[] = [];

// ── 1–3: Ekran / alias sözleşmesi ──────────────────────────────────────────
const regSrc = readFileSync(resolve(root, "src/components/shell/screenRegistry.tsx"), "utf8");
const registryIds = new Set([...regSrc.matchAll(/case\s+"([^"]+)":/g)].map((m) => m[1]));

const navIds = allNavigableTabs().map((t) => t.id);
for (const id of navIds) {
  if (!registryIds.has(id)) errors.push(`Nav tab "${id}" screenRegistry case'ine sahip DEĞİL → default/boş ekran.`);
}

for (const [key, target] of Object.entries(TAB_ALIASES)) {
  const norm = normalizeTabId(target);
  if (!registryIds.has(norm)) errors.push(`Alias "${key}"→"${target}" (norm "${norm}") render case'i YOK.`);
  if (navIds.includes(key)) errors.push(`Alias anahtarı "${key}" CANLI bir nav tab id'sini gölgeliyor (invariant ihlali).`);
}

// ── IA 15+3 sözleşmesi (plan §4, 2026-07-23) ───────────────────────────────
if (navIds.length !== 15) {
  errors.push(`Navigable yüzey sayısı ${navIds.length} — sözleşme 15 (IA 15+3).`);
}
for (const absorbed of ["costs", "profile-integrations", "discovery-engine"]) {
  if (!(absorbed in TAB_ALIASES)) {
    errors.push(`ABSORBED yüzey "${absorbed}" TAB_ALIASES'ta değil (geriye-uyum kırık).`);
  }
}

const aliasTargets = new Set(Object.values(TAB_ALIASES).map(normalizeTabId));
for (const id of registryIds) {
  if (!navIds.includes(id) && !aliasTargets.has(id)) {
    notes.push(`Render case "${id}" nav/alias ile erişilemiyor (orphan? bilinçli mi?).`);
  }
}

// ── 4: vercel.json cron ↔ route ────────────────────────────────────────────
const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};
const crons = vercel.crons ?? [];
for (const c of crons) {
  const routeFile = resolve(root, "src", "app", ...c.path.split("/").filter(Boolean), "route.ts");
  if (!existsSync(routeFile)) errors.push(`vercel.json cron "${c.path}" route dosyası YOK (${routeFile}).`);
}

// ── 5: Mutation route guard backstop (P0) ──────────────────────────────────
function walkRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...walkRoutes(full));
    else if (e.name === "route.ts") out.push(full);
  }
  return out;
}
const apiDir = resolve(root, "src", "app", "api");
const routeFiles = existsSync(apiDir) ? walkRoutes(apiDir) : [];
const MUTATION_RE = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/;
const GUARD_RE = /isOperatorOrCronAuthorized|isCronAuthorized/;
let mutationRoutes = 0;
for (const f of routeFiles) {
  const rel = f.slice(root.length + 1).split(sep).join("/");
  if (rel.includes("/api/auth/")) continue; // login/logout: bilinçli public (proxy allowlist)
  const src = readFileSync(f, "utf8");
  if (MUTATION_RE.test(src)) {
    mutationRoutes++;
    if (!GUARD_RE.test(src)) {
      errors.push(`GUARD YOK (P0): mutation route "${rel}" hiçbir guard'a referans vermiyor.`);
    }
  }
}

// ── Manifest istisnaları (bilinçli — flag edilmez) ─────────────────────────
const MANIFEST_EXCEPTIONS = [
  "/api/mcp — dış MCP araç sözleşmesi (repo içi UI tüketicisi YOK, tasarımca).",
  "/api/ideas + /api/ideas/[id]/create-draft — programatik/MCP Idea sözleşmesi (İlham reverse-engineer yazar; MCP okur).",
  "Değişmez legacy: useXAgentStore / \"xagent-store\" / XAgentApp.tsx / User-Agent (rename = kullanıcı state kaybı).",
  "Dinamik importlar (screenRegistry client switch) statik regex ile çıkarılır — bilinçli.",
];

// ── Rapor ──────────────────────────────────────────────────────────────────
console.log("verify:acceptance — statik ekran/alias/cron/guard sözleşmesi\n");
console.log(
  `Render ekranı: ${registryIds.size} · Nav tab: ${navIds.length} · Alias: ${Object.keys(TAB_ALIASES).length} · Cron: ${crons.length} · Mutation route: ${mutationRoutes} (hepsi guard'lı${errors.some((e) => e.includes("GUARD YOK")) ? " DEĞİL" : ""})`,
);
if (notes.length) {
  console.log("\nNOTLAR:");
  notes.forEach((n) => console.log("  - " + n));
}
console.log("\nMANİFEST istisnaları (bilinçli, flag DEĞİL):");
MANIFEST_EXCEPTIONS.forEach((e) => console.log("  - " + e));

if (errors.length) {
  console.error("\n✗ FAIL:");
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
console.log("\n✓ OK — statik kabul sözleşmesi tutarlı.");
