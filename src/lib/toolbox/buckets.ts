// Shared Toolbox bucket taxonomy. Used by both the API route (to resolve a
// bucket key -> raw categories for `category IN (...)` queries and grouped
// counts) and the ToolboxTab UI (to render the collapsible workflow groups).
// Keeping it in one place avoids the map drifting between server and client.
//
// The raw `category` strings on the right MUST match the values stored on
// ToolboxResource.category (seeded from src/data/toolbox-resources.json).

export type ToolboxBucket = {
  key: string;
  label: string;
  categories: string[];
  /** lucide-react ikon adı (folder tile). */
  icon?: string;
  /** AI bucket vurgusu — coral accent-2 ile işaretlenir. */
  accent2?: boolean;
};

// AI ilk sırada (en çok kullanılan, öne çıkan). Araçlar SON sırada kalmalı:
// bucketForCategory bilinmeyen kategoriyi son bucket'a düşürür (fallback).
export const TOOLBOX_BUCKETS: ToolboxBucket[] = [
  {
    key: "ai",
    label: "Yapay Zeka",
    icon: "Sparkles",
    accent2: true,
    categories: ["AI Eğitim", "LLM", "AI Örnekleri", "Design.md", "AI Sıralama"],
  },
  { key: "tasarim", label: "Tasarım & İlham", icon: "Palette", categories: ["Tasarım", "UI/UX", "İlham"] },
  { key: "behance", label: "Behance Portfolyo", icon: "Briefcase", categories: ["Behance TR", "Behance INT"] },
  { key: "medya", label: "Medya & İçerik", icon: "Clapperboard", categories: ["Medya", "İçerik"] },
  { key: "gelisim", label: "Kişisel Gelişim", icon: "Sprout", categories: ["Kişisel Gelişim"] },
  { key: "araclar", label: "Araçlar & Takip", icon: "Wrench", categories: ["Araçlar", "Rakip Takip"] },
];

/**
 * Alt-kategori chip etiketi — uzun `category` değeri → kısa görünür ad.
 * "AI Sıralama" utility tab'ı ile karışmasın diye chip "Sıralama" gösterir.
 */
export const CATEGORY_CHIP_LABEL: Readonly<Record<string, string>> = {
  "AI Eğitim": "Eğitim",
  LLM: "LLM",
  "AI Örnekleri": "Örnekler",
  "Design.md": "Design.md",
  "AI Sıralama": "Sıralama",
};

/** Kategori için chip etiketi (yoksa kategorinin kendisi). */
export function chipLabel(category: string): string {
  return CATEGORY_CHIP_LABEL[category] ?? category;
}

/** Raw categories for a bucket key, or null if the key is unknown. */
export function categoriesForBucket(key: string): string[] | null {
  return TOOLBOX_BUCKETS.find((b) => b.key === key)?.categories ?? null;
}

/** Which bucket a raw category belongs to (falls back to the last bucket). */
export function bucketForCategory(category: string): string {
  const match = TOOLBOX_BUCKETS.find((b) => b.categories.includes(category));
  return match ? match.key : TOOLBOX_BUCKETS[TOOLBOX_BUCKETS.length - 1].key;
}
