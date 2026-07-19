"use client";

import { useCallback, useEffect, useState } from "react";
import {
  curateOpportunities,
  type Opportunity,
  type OpportunityInput,
} from "@/lib/services/opportunityCuration";

export type EngineNote = { source: string; kind: "error" | "blocked"; message: string };

function hoursSince(iso?: string | null): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

function ageLabel(hours?: number): string {
  if (hours == null) return "";
  if (hours < 1) return "az önce";
  if (hours < 24) return `${Math.round(hours)}s önce`;
  return `${Math.round(hours / 24)}g önce`;
}

// ── Ham motor tipleri (okunan alanların alt kümesi) ──
type RawNews = {
  id: string;
  trTitle?: string | null;
  trSummary?: string | null;
  tweetAngle?: string | null;
  buzzScore?: number | null;
  sourceVerification?: string | null;
  fetchedAt?: string | null;
  publishedAt?: string | null;
  newsSource?: { name?: string } | null;
};
type RawYt = { videoId: string; title?: string; viewsPerDay?: number; outlierScore?: number; publishedAt?: string | null };
type RawRadar = { contentItemId: string; author?: string; caption?: string; multiplier?: number; insufficient?: boolean; url?: string | null };
type RawFlow = {
  id: string;
  sourceHandle?: string;
  content?: string;
  publishedAt?: string | null;
  scannedAt?: string | null;
  score?: { opportunityScore?: number; reason?: string };
  pattern?: { emotionalTrigger?: string; viralityReason?: string };
};

function mapNews(items: RawNews[]): OpportunityInput[] {
  return items
    .filter((i) => i.trTitle)
    .map((i) => {
      const v = i.sourceVerification;
      const whyNow =
        v === "multi_source_confirmed" || v === "editorial_confirmed"
          ? "Teyit edilen haber + tazelik yüksek"
          : v === "official_only"
            ? "Resmî kaynak sinyali"
            : v === "single_source"
              ? "Tek kaynak — teyit bekliyor"
              : "Güncel gündem sinyali";
      const age = hoursSince(i.fetchedAt ?? i.publishedAt);
      const buzz = typeof i.buzzScore === "number" ? i.buzzScore : undefined;
      const al = ageLabel(age);
      return {
        id: `news-${i.id}`,
        source: "news",
        title: i.trTitle ?? "",
        whyNow,
        whyNowDetail: i.tweetAngle ?? i.trSummary ?? undefined,
        badge: buzz != null ? `buzz ${buzz}${al ? ` · ${al}` : ""}` : al || "haber",
        badgeTone: (buzz ?? 0) >= 70 ? "accent" : "muted",
        buzz,
        ageHours: age,
        personaFit: 0.7,
        suggestedPlatform: "X",
        sourcePlatform: i.newsSource?.name || "Haber",
        topicSeed: i.trTitle ?? "",
        rawTab: "news-pool",
      };
    });
}

function mapYoutube(videos: RawYt[]): OpportunityInput[] {
  return videos.map((v) => {
    const mult = typeof v.outlierScore === "number" ? v.outlierScore : undefined;
    const vpd = Math.round(v.viewsPerDay || 0);
    const age = hoursSince(v.publishedAt);
    return {
      id: `yt-${v.videoId}`,
      source: "youtube",
      title: v.title ?? "",
      whyNow: "İvme kazanıyor",
      whyNowDetail: `YouTube'da ${vpd}/gün izlenme — tasarımcı kitlesiyle örtüşüyor`,
      badge: mult != null ? `×${mult.toFixed(1)}` : `${vpd}/gün`,
      badgeTone: (mult ?? 0) >= 3 ? "accent" : "muted",
      multiplier: mult,
      ageHours: age,
      personaFit: 0.65,
      suggestedPlatform: "X",
      sourcePlatform: "YouTube",
      topicSeed: v.title ?? "",
      rawTab: "youtube",
    };
  });
}

function mapRadar(items: RawRadar[]): OpportunityInput[] {
  return items.map((i) => {
    const mult = typeof i.multiplier === "number" ? i.multiplier : undefined;
    const insuf = !!i.insufficient;
    return {
      id: `radar-${i.contentItemId}`,
      source: "radar",
      title: `Rakip Reel outlier · @${i.author || "rakip"}`,
      whyNow: `"İlk 3 saniye" hook formülü`,
      whyNowDetail: insuf
        ? "örneklem yetersiz — çarpan güvenilir değil, yalnız yapı için incele"
        : mult != null
          ? `son iki haftada hesap ortalamasının ×${mult.toFixed(1)} katı izlenme aldı`
          : "rakip outlier",
      badge: insuf ? "yetersiz örneklem" : mult != null ? `×${mult.toFixed(1)} · yeterli örneklem` : "outlier",
      badgeTone: insuf ? "yellow" : "accent",
      multiplier: mult,
      insufficient: insuf,
      personaFit: 0.6,
      suggestedPlatform: "Reels",
      sourcePlatform: "Instagram",
      topicSeed: (i.caption || "").slice(0, 200),
      rawTab: "", // IG outlier'ın standalone advanced ekranı yok (§14)
      url: i.url ?? undefined, // rakip outlier → IG post derin bağlantısı (Phase 5A)
    };
  });
}

function mapDiscovery(candidates: RawFlow[]): OpportunityInput[] {
  return candidates.map((c) => {
    const opp = typeof c.score?.opportunityScore === "number" ? Math.round(c.score.opportunityScore) : undefined;
    const age = hoursSince(c.publishedAt ?? c.scannedAt);
    return {
      id: `flow-${c.id}`,
      source: "discovery",
      title: c.pattern?.emotionalTrigger
        ? `${c.pattern.emotionalTrigger} · @${c.sourceHandle || "kaynak"}`
        : `Viral aday · @${c.sourceHandle || "kaynak"}`,
      whyNow: c.score?.reason || c.pattern?.viralityReason || "Yükselen viral sinyal",
      whyNowDetail: (c.content || "").slice(0, 160),
      badge: opp != null ? `fırsat ${opp}` : "keşif",
      badgeTone: (opp ?? 0) >= 75 ? "accent" : "muted",
      buzz: opp,
      ageHours: age,
      personaFit: 0.6,
      suggestedPlatform: "X",
      sourcePlatform: c.sourceHandle ? `@${c.sourceHandle}` : "X",
      topicSeed: (c.content || "").slice(0, 200),
      rawTab: "flow-radar",
    };
  });
}

type CurateApiSelection = {
  sourceId: string;
  score: number;
  reasons?: { personaFit?: string } & Record<string, string | undefined>;
};

type CurateApiResponse = {
  success: boolean;
  method: "agent" | "deterministic";
  fallbackReason?: string | null;
  selections: CurateApiSelection[];
};

/**
 * Server-side kürasyon (ADR-034 §E): registry executor'daki opportunity-curator
 * POST /api/opportunities/curate üzerinden koşar (LLM istemciden ÇAĞRILMAZ).
 * Route düşerse null döner — çağıran lokal deterministik yola geçer.
 */
async function curateViaServer(
  inputs: OpportunityInput[]
): Promise<{ opportunities: Opportunity[]; method: "agent" | "deterministic" } | null> {
  if (inputs.length === 0) return null;
  try {
    // 6 sn tavan: server kürasyonu yavaşsa (Neon cold-start vb.) Fırsatlar
    // beklemez — lokal deterministik yol devralır (fail-soft, dürüst etiket).
    const res = await fetch("/api/opportunities/curate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates: inputs.slice(0, 200), limit: 8, perSourceCap: 4 }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as CurateApiResponse;
    if (!json.success || !Array.isArray(json.selections) || json.selections.length === 0) return null;
    const byId = new Map(inputs.map((i) => [i.id, i]));
    const method = json.method === "agent" ? "agent" : "deterministic";
    const mapped: Opportunity[] = [];
    for (const sel of json.selections) {
      const input = byId.get(sel.sourceId);
      if (!input) continue; // bağsız id sunulmaz (fail-closed)
      mapped.push({
        ...input,
        score: Math.max(0, Math.min(100, Math.round(sel.score))),
        curationMethod: method,
        curationReason: method === "agent" ? sel.reasons?.personaFit : undefined,
      });
    }
    return mapped.length > 0 ? { opportunities: mapped, method } : null;
  } catch {
    return null;
  }
}

/**
 * Fırsat toplayıcı — 4 motoru PARALEL çeker (Promise.all + yut → kısmi hata bütünü
 * bozmaz), OpportunityInput'a eşler, server-side kürasyona gönderir (agent |
 * deterministic, dürüst etiketli); route düşerse LOKAL deterministik kürasyon
 * devam eder. Her motor hatası/engeli `notes`'ta; tümü düşerse `allFailed`.
 */
export function useOpportunities() {
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [notes, setNotes] = useState<EngineNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [allFailed, setAllFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setAllFailed(false);
    const engineNotes: EngineNote[] = [];
    const inputs: OpportunityInput[] = [];
    let okCount = 0;

    async function run<T>(
      source: string,
      label: string,
      url: string,
      pick: (j: Record<string, unknown>) => T[],
      mapper: (arr: T[]) => OpportunityInput[],
      blocked?: (j: Record<string, unknown>) => string | null,
    ) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`http ${res.status}`);
        const json = (await res.json()) as Record<string, unknown>;
        if (json && json.success === false) throw new Error("payload");
        const blockMsg = blocked?.(json);
        if (blockMsg) {
          engineNotes.push({ source, kind: "blocked", message: blockMsg });
          okCount++;
          return;
        }
        inputs.push(...mapper(pick(json)));
        okCount++;
      } catch {
        engineNotes.push({ source, kind: "error", message: `${label} sinyalleri yüklenemedi.` });
      }
    }

    await Promise.all([
      run<RawNews>("news", "Haber", "/api/news-pool?limit=100&compact=true&sort=buzz&status=analyzed",
        (j) => (j.items as RawNews[]) ?? [], mapNews),
      run<RawYt>("youtube", "Trend", "/api/youtube/videos?limit=50",
        (j) => (j.videos as RawYt[]) ?? [], mapYoutube,
        (j) => (j.configured === false ? "YouTube yapılandırılmamış — Entegrasyonlar → YouTube." : null)),
      run<RawRadar>("radar", "Rakip", "/api/instagram/outliers",
        (j) => (j.items as RawRadar[]) ?? [], mapRadar),
      run<RawFlow>("discovery", "Keşif", "/api/growth/flow-radar?sort=opportunityScore&status=new",
        (j) => (j.candidates as RawFlow[]) ?? [], mapDiscovery),
    ]);

    setNotes(engineNotes);
    const serverCurated = await curateViaServer(inputs);
    setOpportunities(
      serverCurated
        ? serverCurated.opportunities
        : curateOpportunities(inputs).map((o) => ({ ...o, curationMethod: "deterministic" as const }))
    );
    setAllFailed(okCount === 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { opportunities, notes, loading, allFailed, reload: load };
}
