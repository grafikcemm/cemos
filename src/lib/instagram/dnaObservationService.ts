import { prisma } from "@/lib/db/client";
import {
  MIN_EVIDENCE,
  classifyOpeningHook,
  computeEmojiPolicy,
  computeLengthRange,
  computeLineBreakPattern,
  type OpeningHookType,
} from "@/lib/memory/dnaDistillService";
import {
  resolveSingleInstagramBinding,
  type InstagramBindingStatus,
} from "@/lib/instagram/bindingContract";

/**
 * Gözlenen Instagram DNA'sı (Phase 3A §C — ADR-035).
 *
 * SAF + DETERMİNİSTİK + LLM'SİZ + ÜCRETSİZ read model: bağlı hesabın IgMedia
 * caption corpus'undan yapısal istatistik hesaplar. HİÇBİR TABLOYA YAZMAZ —
 * gözlem, insan onayı olmadan identity/CaptionDna/SeriesProfile kuralına
 * DÖNÜŞMEZ (onay yolu: /api/instagram/dna-observation/apply).
 *
 * Dürüstlük kuralları:
 *  - Eksik metrik SIFIR sayılmaz → performanceEvidence "unavailable".
 *  - Like/comment tek başına virallik kanıtı değildir → "engagement_partial"
 *    + uyarı; reach/save/share yalnız IgInsightSnapshot gerçekten varsa.
 *  - < MIN_EVIDENCE örnek → sampleSufficiency "insufficient" (kural çıkarma yok).
 *  - Kaynaklar açık: sources.igMedia sayacı; QueueItem/TrainingExample corpus'u
 *    BU katmana karıştırılmaz (o, dnaDistillService'in X-tarafı işidir).
 */

export const IG_DNA_OBSERVATION_POLICY_VERSION = "3A-1";
const CORPUS_CAP = 100;
const STALE_SYNC_DAYS = 7;

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

export type ObservedMediaInput = {
  mediaId: string;
  caption: string;
  mediaType: string;
  postedAt: Date | null;
  likeCount: number;
  commentCount: number;
};

export type CtaEnding = "soru" | "yonlendirme" | "yok";
export type HashtagPlacement = "end" | "inline" | "mixed" | "none";
export type HashtagCasing = "lower" | "mixed" | "none";
export type PerformanceEvidence = "insights_available" | "engagement_partial" | "unavailable";
export type SampleSufficiency = "sufficient" | "insufficient";

export type InstagramDnaObservation = {
  policyVersion: string;
  evidenceCount: number;
  dateRange: { from: string | null; to: string | null };
  mediaTypeDistribution: Record<string, number>;
  hookDistribution: Partial<Record<OpeningHookType, number>>;
  captionLength: { min: number; max: number; median: number };
  paragraphPattern: string;
  emoji: { ratio: number; policy: "none" | "sparse" | "free" };
  ctaEndingDistribution: Record<CtaEnding, number>;
  hashtag: {
    countRange: { min: number; max: number };
    placement: HashtagPlacement;
    casing: HashtagCasing;
    coreTags: string[];
    rotatingTags: string[];
  };
  sampleSufficiency: SampleSufficiency;
  performanceEvidence: PerformanceEvidence;
  sources: { igMedia: number };
  warnings: string[];
};

/** Caption'ı gövde + sondaki hashtag bloğuna ayırır (gövde istatistiği saf kalır). */
export function splitCaptionBody(caption: string): {
  body: string;
  trailingTagLines: number;
  tags: string[];
  inlineTagCount: number;
} {
  const lines = caption.split(/\r?\n/);
  let cut = lines.length;
  // Sondan gerıye: yalnız hashtag/boşluktan oluşan satırlar hashtag bloğudur.
  for (let i = lines.length - 1; i >= 0; i--) {
    const stripped = lines[i].replace(HASHTAG_RE, "").trim();
    const hasTag = (lines[i].match(HASHTAG_RE) ?? []).length > 0;
    if (lines[i].trim() === "") {
      if (cut === i + 1) cut = i;
      continue;
    }
    if (hasTag && stripped === "") cut = i;
    else break;
  }
  const body = lines.slice(0, cut).join("\n").trim();
  const tags = caption.match(HASHTAG_RE) ?? [];
  const inlineTagCount = (body.match(HASHTAG_RE) ?? []).length;
  return { body, trailingTagLines: lines.length - cut, tags: [...tags], inlineTagCount };
}

/** Gövdenin son anlamlı satırından CTA-bitiş sınıfı. */
export function classifyCtaEnding(body: string): CtaEnding {
  const lastLine =
    body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .pop() ?? "";
  if (lastLine === "") return "yok";
  if (/\?\s*$/.test(lastLine)) return "soru";
  if (/\b(kaydet|takip|yorum|payla[şs]|linki?|bio|profil|dm)\b/iu.test(lastLine)) {
    return "yonlendirme";
  }
  return "yok";
}

function normalizeForDedup(caption: string): string {
  return caption.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Saf çekirdek: bounded medya girdisinden gözlem hesaplar (yazma yok, env yok). */
export function computeInstagramDnaObservation(
  mediaRows: ObservedMediaInput[],
  opts: { insightSnapshotCount: number }
): InstagramDnaObservation {
  const warnings: string[] = [];

  // Dedup: mediaId + normalize içerik hash'i; boş caption hariç.
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  const media: ObservedMediaInput[] = [];
  for (const m of mediaRows) {
    if (!m.caption || m.caption.trim() === "") continue;
    if (seenIds.has(m.mediaId)) continue;
    const norm = normalizeForDedup(m.caption);
    if (seenContent.has(norm)) continue;
    seenIds.add(m.mediaId);
    seenContent.add(norm);
    media.push(m);
    if (media.length >= CORPUS_CAP) break;
  }

  const splits = media.map((m) => splitCaptionBody(m.caption));
  const bodies = splits.map((s) => s.body).filter((b) => b.length > 0);

  const mediaTypeDistribution: Record<string, number> = {};
  for (const m of media) {
    const key = m.mediaType || "unknown";
    mediaTypeDistribution[key] = (mediaTypeDistribution[key] ?? 0) + 1;
  }

  const hookDistribution: Partial<Record<OpeningHookType, number>> = {};
  for (const b of bodies) {
    const hook = classifyOpeningHook(b);
    hookDistribution[hook] = (hookDistribution[hook] ?? 0) + 1;
  }

  const ctaEndingDistribution: Record<CtaEnding, number> = { soru: 0, yonlendirme: 0, yok: 0 };
  for (const b of bodies) ctaEndingDistribution[classifyCtaEnding(b)]++;

  // Emoji: gövde bazlı oran + politika.
  const withEmoji = bodies.filter((b) => EMOJI_RE.test(b)).length;
  const emojiRatio = bodies.length > 0 ? withEmoji / bodies.length : 0;

  // Hashtag istatistiği.
  const tagFreq = new Map<string, number>();
  const perCaptionTagCounts: number[] = [];
  let endOnly = 0;
  let inlineAny = 0;
  let withTags = 0;
  let lowerTags = 0;
  let totalTags = 0;
  for (const s of splits) {
    if (s.tags.length === 0) continue;
    withTags++;
    perCaptionTagCounts.push(s.tags.length);
    if (s.inlineTagCount === 0) endOnly++;
    else inlineAny++;
    for (const t of s.tags) {
      totalTags++;
      if (t === t.toLowerCase()) lowerTags++;
      const key = t.toLowerCase();
      tagFreq.set(key, (tagFreq.get(key) ?? 0) + 1);
    }
  }
  const ranked = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]);
  const coreTags = ranked.filter(([, n]) => n >= 3).slice(0, 8).map(([t]) => t);
  const rotatingTags = ranked
    .filter(([t, n]) => n < 3 && !coreTags.includes(t))
    .slice(0, 12)
    .map(([t]) => t);
  const placement: HashtagPlacement =
    withTags === 0 ? "none" : inlineAny === 0 ? "end" : endOnly === 0 ? "inline" : "mixed";
  const casing: HashtagCasing =
    totalTags === 0 ? "none" : lowerTags === totalTags ? "lower" : "mixed";

  // Tarih aralığı.
  const dates = media
    .map((m) => m.postedAt)
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());
  const dateRange = {
    from: dates[0]?.toISOString() ?? null,
    to: dates[dates.length - 1]?.toISOString() ?? null,
  };

  // Performans kanıtı — eksik metrik sıfır SAYILMAZ.
  let performanceEvidence: PerformanceEvidence;
  if (opts.insightSnapshotCount > 0) {
    performanceEvidence = "insights_available";
  } else if (media.some((m) => m.likeCount > 0 || m.commentCount > 0)) {
    performanceEvidence = "engagement_partial";
    warnings.push(
      "Yalnız like/yorum sayısı var — tek başına virallik kanıtı değildir; reach/save/share için insight sync gerekli."
    );
  } else {
    performanceEvidence = "unavailable";
    warnings.push("Performans metriği yok — metrikler sıfır değil, MEVCUT DEĞİL.");
  }

  const sampleSufficiency: SampleSufficiency =
    bodies.length >= MIN_EVIDENCE ? "sufficient" : "insufficient";
  if (sampleSufficiency === "insufficient") {
    warnings.push(
      `Örneklem yetersiz (${bodies.length}/${MIN_EVIDENCE}) — bu gözlemden kural çıkarılmamalı.`
    );
  }

  return {
    policyVersion: IG_DNA_OBSERVATION_POLICY_VERSION,
    evidenceCount: bodies.length,
    dateRange,
    mediaTypeDistribution,
    hookDistribution,
    captionLength: computeLengthRange(bodies),
    paragraphPattern: computeLineBreakPattern(bodies),
    emoji: { ratio: Math.round(emojiRatio * 100) / 100, policy: computeEmojiPolicy(bodies) },
    ctaEndingDistribution,
    hashtag: {
      countRange:
        perCaptionTagCounts.length > 0
          ? { min: Math.min(...perCaptionTagCounts), max: Math.max(...perCaptionTagCounts) }
          : { min: 0, max: 0 },
      placement,
      casing,
      coreTags,
      rotatingTags,
    },
    sampleSufficiency,
    performanceEvidence,
    sources: { igMedia: media.length },
    warnings,
  };
}

export type ObservationResult = {
  status: InstagramBindingStatus | "no_media";
  reason: string;
  account?: { id: string; handle: string };
  binding?: {
    provider: string;
    externalHandle: string;
    connectionStatus: string;
    lastSuccessfulSyncAt: string | null;
    staleSync: boolean;
  };
  observation?: InstagramDnaObservation;
};

/**
 * Orkestratör: binding sözleşmesi (fail-closed) → bounded IgMedia okuma →
 * saf gözlem. Yazma YOK; LLM YOK.
 */
export async function getInstagramDnaObservation(now: Date = new Date()): Promise<ObservationResult> {
  const resolved = await resolveSingleInstagramBinding();
  if (resolved.status !== "ok" || !resolved.account || !resolved.binding) {
    return { status: resolved.status, reason: resolved.reason };
  }

  const lastSync = resolved.binding.lastSuccessfulSyncAt;
  const staleSync =
    !lastSync || now.getTime() - lastSync.getTime() > STALE_SYNC_DAYS * 24 * 3_600_000;

  const bindingOut = {
    provider: resolved.binding.provider,
    externalHandle: resolved.binding.externalHandle,
    connectionStatus: resolved.binding.connectionStatus,
    lastSuccessfulSyncAt: lastSync?.toISOString() ?? null,
    staleSync,
  };

  const [rows, insightSnapshotCount] = await Promise.all([
    prisma.igMedia.findMany({
      where: { caption: { not: "" } },
      orderBy: { postedAt: "desc" },
      take: CORPUS_CAP,
      select: {
        mediaId: true,
        caption: true,
        mediaType: true,
        postedAt: true,
        likeCount: true,
        commentCount: true,
      },
    }),
    prisma.igInsightSnapshot.count(),
  ]);

  if (rows.length === 0) {
    return {
      status: "no_media",
      reason: "Bağlı hesap için senkronize edilmiş Instagram medyası yok — önce sync çalıştır.",
      account: resolved.account,
      binding: bindingOut,
    };
  }

  const observation = computeInstagramDnaObservation(rows, { insightSnapshotCount });
  if (staleSync) {
    observation.warnings.push(
      "Son başarılı sync 7 günden eski veya hiç yok — gözlem bayat olabilir."
    );
  }

  return {
    status: "ok",
    reason: "Gözlem hazır.",
    account: resolved.account,
    binding: bindingOut,
    observation,
  };
}
