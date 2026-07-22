/**
 * Statik AI-ekonomi doğrulaması (Phase 5F §17).
 *
 *   npm run verify:ai-economics
 *
 * AĞSIZ + ÜCRETSİZ: hiçbir sağlayıcı çağrısı yapmaz, hiçbir DB'ye dokunmaz.
 * Routing/pricing/budget SÖZLEŞMESİNİ statik olarak zorlar; ihlalde exit 1.
 *
 * Zorlananlar:
 *   1. Her preset bir purposePrefix taşır (her çağrı attribution alır).
 *   2. Her preset primary + fallback için katalog-doğrulanmış fiyat kaynağı var.
 *   3. Writer ailesi ≠ final-judge ailesi (C3 self-preference savunması).
 *   4. Premium/final-editor default-on DEĞİL.
 *   5. Evaluation harcaması default-off (AI_EVAL_SPEND_ENABLED gerekli).
 *   6. Bilinmeyen model sessizce $0 DEĞİL (pozitif rol tahminine düşer).
 *   7. Preset maxPrice pozitif VE primary katalog fiyatı tavanın altında
 *      (aksi halde sağlayıcı primary'yi reddeder → sessiz fallback).
 *   8. Budget sınıfları mevcut (essential/background/evaluation eşlemesi).
 *   9. Pricing verified-at markörü var.
 */
import {
  PRESETS,
  familyOf,
  validatePresets,
} from "../src/lib/ai/presets";
import {
  MODEL_PRICING,
  MODEL_PRICING_VERIFIED_AT,
  modelConfigs,
  estimateModelCost,
  hasVerifiedPrice,
} from "../src/lib/ai/model-config";
import { getCostLimits } from "../src/lib/config/costLimits";
import { inferAiBudgetClass } from "../src/lib/config/costGate";

const errors: string[] = [];
const notes: string[] = [];

// 0. Preset lint (floating/katalog/family/fallback) — build kapısıyla aynı.
try {
  validatePresets();
} catch (e) {
  errors.push(`validatePresets: ${e instanceof Error ? e.message : String(e)}`);
}

for (const p of Object.values(PRESETS)) {
  // 1. purpose attribution
  if (!p.purposePrefix || !p.purposePrefix.trim()) {
    errors.push(`${p.name}: purposePrefix boş (attribution yok)`);
  }
  // 2. price source for primary + fallbacks
  if (!hasVerifiedPrice(p.primary)) {
    errors.push(`${p.name}: primary fiyat kaynağı yok (${p.primary})`);
  }
  for (const f of p.fallbacks) {
    if (!hasVerifiedPrice(f)) {
      errors.push(`${p.name}: fallback fiyat kaynağı yok (${f})`);
    }
  }
  // 7. maxPrice pozitif + primary katalog fiyatı tavanın altında
  if (p.maxPrice.prompt <= 0 || p.maxPrice.completion <= 0) {
    errors.push(`${p.name}: maxPrice pozitif olmalı`);
  }
  const pricing = MODEL_PRICING[p.primary];
  if (pricing) {
    const inM = pricing.inputCostPerMillion;
    const outM = pricing.outputCostPerMillion;
    if (inM > p.maxPrice.prompt || outM > p.maxPrice.completion) {
      errors.push(
        `${p.name}: primary katalog fiyatı (${inM}/${outM}) maxPrice tavanını ` +
          `(${p.maxPrice.prompt}/${p.maxPrice.completion}) aşıyor → sağlayıcı reddeder`,
      );
    }
  }
}

// 3. writer ≠ judge ailesi (validatePresets de kontrol eder; burada açık rapor)
const writerFam = familyOf(PRESETS["cemos-writer"].primary);
const judgeFam = familyOf(PRESETS["cemos-final-judge"].primary);
if (writerFam === judgeFam) {
  errors.push(`writer ailesi (${writerFam}) == judge ailesi (${judgeFam})`);
} else {
  notes.push(`writer/judge aile ayrımı: ${writerFam} ↔ ${judgeFam}`);
}

// 4. premium/final-editor default-on değil
if (modelConfigs.premiumCreative.enabledByDefault) {
  errors.push("premiumCreative default-on olmamalı");
}
if (modelConfigs.finalEditor.enabledByDefault) {
  errors.push("finalEditor default-on olmamalı");
}

// 5. evaluation spend default-off (env açık değilse)
const limits = getCostLimits();
if (process.env.AI_EVAL_SPEND_ENABLED !== "true" && limits.evalSpendEnabled) {
  errors.push("evaluation harcaması env kapalıyken evalSpendEnabled=true görünüyor");
} else {
  notes.push(`evalSpendEnabled=${limits.evalSpendEnabled} (env AI_EVAL_SPEND_ENABLED gerekli)`);
}

// 6. bilinmeyen model sessizce $0 değil
const unknownCost = estimateModelCost(1_000_000, 1_000_000, "__unknown__/model", "creativeWriter");
if (!(unknownCost > 0)) {
  errors.push(`bilinmeyen model $0 döndü (${unknownCost}) — sessiz $0 yasak`);
}

// 8. budget sınıfları mevcut ve doğru eşleşiyor
const budgetCases: Array<[string, string]> = [
  ["writer_x_draft", "essential"],
  ["judge_x_critique", "essential"],
  ["eval_thread_smoke", "evaluation"],
  ["news_translate", "background"],
];
for (const [purpose, expected] of budgetCases) {
  const got = inferAiBudgetClass(purpose);
  if (got !== expected) {
    errors.push(`budget sınıfı: ${purpose} → ${got} (beklenen ${expected})`);
  }
}

// 9. pricing verified-at markörü
if (!/^\d{4}-\d{2}-\d{2}$/.test(MODEL_PRICING_VERIFIED_AT)) {
  errors.push(`MODEL_PRICING_VERIFIED_AT geçersiz (${MODEL_PRICING_VERIFIED_AT})`);
}

// ── Rapor ──
console.log("verify:ai-economics — statik routing/pricing/budget sözleşmesi\n");
console.log(
  `Preset: ${Object.keys(PRESETS).length} · Fiyatlı model: ${Object.keys(MODEL_PRICING).length} · ` +
    `Pricing doğrulandı: ${MODEL_PRICING_VERIFIED_AT}`,
);
if (notes.length) {
  console.log("\nNOTLAR:");
  notes.forEach((n) => console.log("  - " + n));
}
if (errors.length) {
  console.error("\n✗ FAIL:");
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
console.log("\n✓ OK — AI-ekonomi sözleşmesi tutarlı (ağsız, ücretsiz).");
