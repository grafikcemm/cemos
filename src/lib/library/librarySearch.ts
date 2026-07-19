/**
 * Birleşik kütüphane arama çekirdeği (05 §D1) — 4 legacy kütüphaneyi (viral/
 * keyword/prompt/pattern) + içerik havuzunu tek tipli, sayfalı sonuç kümesinde
 * birleştirir. Bu modül SAF (DB/React yok) → birim testlenebilir. Route ham
 * satırları LibItem'a eşler; birleştirme/sıralama/sayfalama burada.
 */

export type LibItemType = "viral" | "keyword" | "prompt" | "pattern" | "content";

export type LibItem = {
  id: string; // tip önekli (viral-.., keyword-..)
  type: LibItemType;
  title: string;
  body: string;
  platform?: string;
  meta?: string;
  tags: string[];
  createdAt?: string; // ISO; yoksa sıralamada sona düşer
  /** İlham analizine köprü uygun mu (viral/content). */
  canAnalyze?: boolean;
  contentItemId?: string;
  sourceUrl?: string;
  score?: number;
  /** Kanonik içerik hangi (arşivlenmemiş) panolarda kayıtlı — "Kayıtlı" durumu. */
  savedBoards?: Array<{ boardId: string; boardName: string }>;
};

export type LibCounts = Record<LibItemType, number>;

export type KeywordJson = {
  categories?: { name?: string; keywords?: string[][] }[];
};

function slug(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9ğüşıöç]+/gi, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

/**
 * Statik anahtar kelime JSON'unu ({categories:[{name,keywords:[[tr,en]]}]})
 * sorguya göre süzüp LibItem'lara düzleştirir. Türkçe-duyarlı küçük harf eşleşme.
 */
export function flattenKeywords(data: KeywordJson, q: string): LibItem[] {
  const ql = q.trim().toLocaleLowerCase("tr-TR");
  const out: LibItem[] = [];
  for (const cat of data.categories ?? []) {
    for (const pair of cat.keywords ?? []) {
      const tr = pair?.[0] ?? "";
      const en = pair?.[1] ?? "";
      if (!tr) continue;
      if (ql && !tr.toLocaleLowerCase("tr-TR").includes(ql) && !en.toLowerCase().includes(ql)) continue;
      out.push({
        id: `keyword-${slug(tr)}`,
        type: "keyword",
        title: tr,
        body: en,
        meta: cat.name ?? "",
        tags: cat.name ? [cat.name] : [],
      });
    }
  }
  return out;
}

/** Yeni-önce sıralama; tarihsiz (keyword) sona; id tie-break → deterministik. */
export function compareLibItems(a: LibItem, b: LibItem): number {
  const ta = a.createdAt ? Date.parse(a.createdAt) : -Infinity;
  const tb = b.createdAt ? Date.parse(b.createdAt) : -Infinity;
  if (Number.isNaN(ta) || Number.isNaN(tb) || tb !== ta) {
    const na = Number.isNaN(ta) ? -Infinity : ta;
    const nb = Number.isNaN(tb) ? -Infinity : tb;
    if (nb !== na) return nb - na;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Kaynaklar-arası birleştir, sırala, [offset, offset+limit) dilimini al. */
export function mergeAndPaginate(items: LibItem[], offset: number, limit: number): LibItem[] {
  const sorted = [...items].sort(compareLibItems);
  return sorted.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit));
}

export function emptyCounts(): LibCounts {
  return { viral: 0, keyword: 0, prompt: 0, pattern: 0, content: 0 };
}
