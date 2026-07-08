/**
 * Canlı OpenRouter katalog doğrulaması (2026-07-09 slug kararı).
 *
 *   npm run verify:catalog
 *
 * `https://openrouter.ai/api/v1/models` çekilir; her preset primary'si ve
 * fallback'i katalogda aranır. Eksik slug veya erişilemeyen katalog = exit 1
 * (AÇIK hata) — sessiz mock fallback production primary drift'ini saklayamaz.
 * Build/CI öncesi ve model değişikliklerinde koşulmalı; snapshot
 * (presets.KNOWN_CATALOG) drift'lediyse burada yakalanır.
 */
import { PRESETS, KNOWN_CATALOG, CATALOG_SNAPSHOT_DATE } from "../src/lib/ai/presets";

const MODELS_URL = "https://openrouter.ai/api/v1/models";

async function main() {
  console.log(`Canlı katalog doğrulaması: ${MODELS_URL}`);
  console.log(`Snapshot tarihi: ${CATALOG_SNAPSHOT_DATE}`);

  let ids: Set<string>;
  try {
    const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as { data?: { id?: string }[] };
    ids = new Set((payload.data ?? []).map((m) => m.id).filter((x): x is string => !!x));
    if (ids.size === 0) throw new Error("katalog boş döndü");
  } catch (err) {
    console.error(
      `DOĞRULANAMADI: OpenRouter kataloğuna erişilemedi (${err instanceof Error ? err.message : err}). ` +
        "Ağ yoksa bu adım açıkça DOĞRULANAMADI sayılır — sessiz geçme.",
    );
    process.exit(1);
  }

  const missing: string[] = [];
  for (const preset of Object.values(PRESETS)) {
    if (!ids.has(preset.primary)) missing.push(`${preset.name} primary: ${preset.primary}`);
    for (const f of preset.fallbacks) {
      if (!ids.has(f)) missing.push(`${preset.name} fallback: ${f}`);
    }
  }
  for (const snap of KNOWN_CATALOG) {
    if (!ids.has(snap)) missing.push(`snapshot drift: ${snap}`);
  }

  if (missing.length > 0) {
    console.error("KATALOG UYUŞMAZLIĞI — aşağıdaki slug'lar canlı katalogda YOK:");
    for (const m of missing) console.error(`  - ${m}`);
    console.error(
      "Primary drift saklanamaz: presets.ts güncellenmeli veya karar Ali Cem'e taşınmalı.",
    );
    process.exit(1);
  }

  console.log(`OK — ${Object.keys(PRESETS).length} preset (primary+fallback) canlı katalogda mevcut.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
