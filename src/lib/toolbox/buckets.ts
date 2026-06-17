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
};

export const TOOLBOX_BUCKETS: ToolboxBucket[] = [
  { key: "tasarim", label: "Tasarım & İlham", categories: ["Tasarım", "UI/UX", "İlham"] },
  { key: "behance", label: "Behance Portfolyo", categories: ["Behance TR", "Behance INT"] },
  { key: "medya", label: "Medya & İçerik", categories: ["Medya", "İçerik"] },
  { key: "ai", label: "Yapay Zeka", categories: ["Yapay Zeka"] },
  { key: "gelisim", label: "Kişisel Gelişim", categories: ["Kişisel Gelişim"] },
  { key: "araclar", label: "Araçlar & Takip", categories: ["Araçlar", "Rakip Takip"] },
];

/** Raw categories for a bucket key, or null if the key is unknown. */
export function categoriesForBucket(key: string): string[] | null {
  return TOOLBOX_BUCKETS.find((b) => b.key === key)?.categories ?? null;
}

/** Which bucket a raw category belongs to (falls back to the last bucket). */
export function bucketForCategory(category: string): string {
  const match = TOOLBOX_BUCKETS.find((b) => b.categories.includes(category));
  return match ? match.key : TOOLBOX_BUCKETS[TOOLBOX_BUCKETS.length - 1].key;
}
