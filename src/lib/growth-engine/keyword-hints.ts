/**
 * Anahtar Kelime Kütüphanesi → görsel prompt ipuçları (F5e). Statik JSON'dan
 * (DB seed'e bağımsız) görsel-ağırlıklı kategorilerden İngilizce stil terimleri
 * seçer; imagePrompt bloğuna "şunları değerlendir" olarak eklenir. Deterministik
 * seed ile döner (kaynak metne göre çeşitlenir), ~10 terimle sınırlı.
 */

import keywordLibrary from "@/data/keyword-library.json";

// Görsel/tasarım açısından imagePrompt'a en çok değer katan kategoriler.
const VISUAL_CATEGORIES = new Set([
  "Işık",
  "Kompozisyon",
  "Açı / Kamera",
  "Renk & Atmosfer",
  "3D & Render Stilleri",
  "Ürün Yerleşimi",
  "İllüstrasyon Stilleri",
  "Grafik Tasarım & Poster",
]);

// Düz EN terim listesi (bir kez hesaplanır).
const VISUAL_EN_TERMS: string[] = keywordLibrary.categories
  .filter((c) => VISUAL_CATEGORIES.has(c.name))
  .flatMap((c) => c.keywords.map((k) => k[1]))
  .filter((t): t is string => typeof t === "string" && t.length > 0);

/**
 * Kaynak metinden türetilen seed ile ~`count` benzersiz İngilizce görsel terimi
 * döner. Boş liste → boş (fail-soft; çağıran blok atlar).
 */
export function pickVisualKeywordHints(sourceText: string, count = 10): string[] {
  if (VISUAL_EN_TERMS.length === 0) return [];
  const seed = Math.abs(
    (sourceText || "").split("").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0),
  );
  const step = 7; // liste boyutuyla asal olmaya yakın → iyi dağılım
  const out: string[] = [];
  const seen = new Set<number>();
  let idx = seed % VISUAL_EN_TERMS.length;
  for (let i = 0; i < VISUAL_EN_TERMS.length && out.length < count; i++) {
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(VISUAL_EN_TERMS[idx]);
    }
    idx = (idx + step) % VISUAL_EN_TERMS.length;
  }
  return out;
}
