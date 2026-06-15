/**
 * Instagram İstatistik parse'ı (Faz E) — SAF, LLM YOK. Birim test edilebilir.
 *
 * Meta insight metrik adları sürümler arası kayar (impressions→views, values[] vs
 * total_value). Bu modül HER ihtimale TOLERANT: bilinen adların hepsini dener,
 * bulamazsa 0. Ham JSON çağıran tarafta saklanır (drift teşhisi).
 *
 * Ayrıca carousel SERİ performansı: medya caption'ını ig-series.json etiketlerine
 * eşler, seri başına toplar, engagement'a göre sıralar.
 */

export type AccountMetrics = {
  reach: number;
  views: number;
  accountsEngaged: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
};

export type MediaInsightItem = {
  mediaId: string;
  caption: string;
  permalink: string;
  mediaType: string;
  reach: number;
  likes: number;
  saves: number;
  shares: number;
  comments: number;
};

export type SeriesConfigEntry = { label: string; keywords: string[] };

export type SeriesPerf = {
  label: string;
  postCount: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalShares: number;
  avgEngagement: number;
};

const SERIES_OTHER = "Diğer";

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Bir insight entry'sinden değer: önce total_value.value, sonra values[] toplamı. */
function entryValue(entry: Record<string, unknown>): number {
  const total = asRecord(entry.total_value);
  if (typeof total.value === "number") return total.value;
  const values = asArray(entry.values);
  if (values.length > 0) {
    let sum = 0;
    let found = false;
    for (const v of values) {
      const rec = asRecord(v);
      if (typeof rec.value === "number") {
        sum += rec.value;
        found = true;
      }
    }
    if (found) return sum;
  }
  return 0;
}

/** Hesap metrikleri. data[].name → değer haritası; impressions↔views normalize. */
export function parseAccountInsights(raw: unknown): AccountMetrics {
  const data = asArray(asRecord(raw).data);
  const map = new Map<string, number>();
  for (const e of data) {
    const entry = asRecord(e);
    const name = asString(entry.name).toLowerCase();
    if (name) map.set(name, entryValue(entry));
  }
  const pick = (...names: string[]): number => {
    for (const n of names) {
      const v = map.get(n);
      if (typeof v === "number") return v;
    }
    return 0;
  };
  return {
    reach: pick("reach"),
    // Eski sürüm "impressions", yeni "views" — hangisi varsa.
    views: pick("views", "impressions"),
    accountsEngaged: pick("accounts_engaged"),
    likes: pick("likes"),
    comments: pick("comments"),
    saves: pick("saves", "saved"),
    shares: pick("shares"),
  };
}

/** Medya başına insight. Eksik metrik → like_count/comments_count fallback → 0. */
export function parseMediaInsights(raw: unknown): MediaInsightItem[] {
  const data = asArray(asRecord(raw).data);
  const out: MediaInsightItem[] = [];
  for (const m of data) {
    const media = asRecord(m);
    const id = asString(media.id);
    if (!id) continue;
    const insightData = asArray(asRecord(media.insights).data);
    const im = new Map<string, number>();
    for (const e of insightData) {
      const entry = asRecord(e);
      const name = asString(entry.name).toLowerCase();
      if (name) im.set(name, entryValue(entry));
    }
    const pick = (...names: string[]): number => {
      for (const n of names) {
        const v = im.get(n);
        if (typeof v === "number") return v;
      }
      return 0;
    };
    out.push({
      mediaId: id,
      caption: asString(media.caption),
      permalink: asString(media.permalink),
      mediaType: asString(media.media_type),
      reach: pick("reach"),
      likes: pick("likes") || asNumber(media.like_count),
      saves: pick("saved", "saves"),
      shares: pick("shares"),
      comments: pick("comments") || asNumber(media.comments_count),
    });
  }
  return out;
}

/** Reach'e göre azalan en iyi N medya. */
export function topMediaByReach(items: MediaInsightItem[], topN = 8): MediaInsightItem[] {
  return [...items].sort((a, b) => b.reach - a.reach).slice(0, Math.max(0, topN));
}

/** igEngagement formülü — kaydet/paylaş ağırlıklı, reach normalize. */
export function computeEngagementScore(agg: {
  totalSaves: number;
  totalShares: number;
  totalComments: number;
  totalLikes: number;
  totalReach: number;
}): number {
  const weighted =
    agg.totalSaves * 4 + agg.totalShares * 5 + agg.totalComments * 2 + agg.totalLikes;
  return (weighted / Math.max(agg.totalReach, 1)) * 1000;
}

/**
 * Medyaları caption keyword eşleşmesiyle serilere gruplar, seri başına toplar,
 * avgEngagement'a göre azalan sıralar. Eşleşmeyen → "Diğer" (sessizce düşmez).
 */
export function groupMediaBySeries(
  items: MediaInsightItem[],
  config: SeriesConfigEntry[]
): SeriesPerf[] {
  const acc = new Map<string, SeriesPerf>();
  const ensure = (label: string): SeriesPerf => {
    let s = acc.get(label);
    if (!s) {
      s = {
        label,
        postCount: 0,
        totalReach: 0,
        totalLikes: 0,
        totalComments: 0,
        totalSaves: 0,
        totalShares: 0,
        avgEngagement: 0,
      };
      acc.set(label, s);
    }
    return s;
  };
  for (const item of items) {
    const cap = item.caption.toLowerCase();
    let label = SERIES_OTHER;
    for (const series of config) {
      if (series.keywords.some((kw) => kw && cap.includes(kw.toLowerCase()))) {
        label = series.label;
        break;
      }
    }
    const s = ensure(label);
    s.postCount += 1;
    s.totalReach += item.reach;
    s.totalLikes += item.likes;
    s.totalComments += item.comments;
    s.totalSaves += item.saves;
    s.totalShares += item.shares;
  }
  const list = Array.from(acc.values());
  for (const s of list) s.avgEngagement = Math.round(computeEngagementScore(s) * 100) / 100;
  return list.sort((a, b) => b.avgEngagement - a.avgEngagement);
}
