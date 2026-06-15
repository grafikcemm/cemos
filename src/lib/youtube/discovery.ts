/**
 * Kanal keşfi — tek seferlik manuel iş (cron'da ASLA; search.list 100u/sorgu).
 * Bulunan kanallar enabled:false öneri olarak yazılır; kullanıcı Kanallar UI'dan
 * onaylar (setEnabled + kategori). Mevcut kanallar ASLA üzerine yazılmaz.
 */

import { searchChannels } from "./ytClient";
import { isYouTubeConfigured } from "./ytConfig";
import { ytChannelRepo } from "@/lib/db/ytChannelRepo";

const DEFAULT_QUERIES = [
  "yapay zeka türkçe",
  "ai araçları türkçe",
  "yapay zeka haber",
  "grafik tasarım yapay zeka",
  "prompt mühendisliği türkçe",
];

const DAILY_DISCOVERY_CAP = 20;

export type DiscoveryResult = {
  configured: boolean;
  found: number;
  added: number;
  skippedExisting: number;
  quotaUnits: number;
};

export async function runDiscovery(opts?: {
  queries?: string[];
  cap?: number;
}): Promise<DiscoveryResult> {
  if (!isYouTubeConfigured()) {
    return { configured: false, found: 0, added: 0, skippedExisting: 0, quotaUnits: 0 };
  }
  const queries = (opts?.queries ?? DEFAULT_QUERIES).slice(0, 10);
  const cap = Math.min(Math.max(opts?.cap ?? DAILY_DISCOVERY_CAP, 1), DAILY_DISCOVERY_CAP);
  const existing = new Set((await ytChannelRepo.listAll()).map((c) => c.channelId));

  let found = 0;
  let added = 0;
  let skippedExisting = 0;
  let quotaUnits = 0;

  for (const query of queries) {
    if (added >= cap) break;
    const res = await searchChannels(query, { maxResults: 10 });
    quotaUnits += res.quotaUnits;
    for (const ch of res.data) {
      found++;
      if (existing.has(ch.channelId)) {
        skippedExisting++;
        continue;
      }
      if (added >= cap) break;
      try {
        await ytChannelRepo.upsertByChannelId({
          channelId: ch.channelId,
          handle: ch.title,
          title: ch.title,
          category: "global", // keşfedilen → global; onayda kullanıcı düzeltir
          isCompetitor: true,
          discoveredFrom: "discovery",
          enabled: false,
        });
        existing.add(ch.channelId);
        added++;
      } catch {
        // dedup yarışı / geçersiz veri — atla
      }
    }
  }

  return { configured: true, found, added, skippedExisting, quotaUnits };
}
