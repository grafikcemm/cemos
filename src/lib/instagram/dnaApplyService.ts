import { prisma } from "@/lib/db/client";
import type { InstagramDnaObservation } from "@/lib/instagram/dnaObservationService";

/**
 * İnsan-onaylı DNA uygulama servisi (Phase 3A §D — ADR-035).
 *
 * Gözlem → onaylı DNA geçişi YALNIZ buradan olur ve her çağrı açık insan
 * onayıdır (UI'daki "DNA'ya uygula"). Kurallar:
 *  - Değerler İSTEMCİDEN ALINMAZ — sunucu, güncel gözlemden kendisi türetir
 *    (sahte değer enjeksiyonu imkânsız).
 *  - selected-fields-only: yalnız seçili alanlar yazılır; körlemesine tam
 *    overwrite yok.
 *  - expectedVersion stale → değerler ZATEN uygulanmışsa idempotent no-op
 *    (alreadyApplied), değilse "version_conflict" (route 409'a çevirir).
 *  - Yetersiz örneklem / kanıtsız alan → "insufficient_evidence" (route 422).
 *  - CaptionDna yazımı provenance="operator" + version bump — böylece
 *    dnaDistillService'in otomatik istatistiği bu satırı bir daha EZEMEZ
 *    (mevcut skipped_operator_owned invariant'ı).
 *  - SeriesProfile hedefi yalnız seri-özel hashtag override'ıdır; hesap-geneli
 *    kural CaptionDna'da kalır (sorumluluk karışmaz).
 */

export const CAPTION_DNA_APPLY_FIELDS = [
  "openingHookTypes",
  "lengthRange",
  "emojiPolicy",
  "lineBreakPattern",
  "ctaStyle",
] as const;
export type CaptionDnaApplyField = (typeof CAPTION_DNA_APPLY_FIELDS)[number];

export type ApplyErrorCode =
  | "empty_selection"
  | "insufficient_evidence"
  | "version_conflict"
  | "not_found";

export type ApplyResult =
  | {
      ok: true;
      target: "caption_dna" | "series_hashtag";
      appliedFields: string[];
      version: number;
      alreadyApplied: boolean;
    }
  | { ok: false; code: ApplyErrorCode; message: string };

function dominantKey(dist: Record<string, number>): string | null {
  const entries = Object.entries(dist).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Gözlemden CaptionDna alan değerlerini türetir. Kanıtsız alan için hata
 * mesajlı null döner (o alan seçilemez).
 */
export function deriveCaptionDnaValues(
  observation: InstagramDnaObservation
): Partial<Record<CaptionDnaApplyField, string>> {
  const values: Partial<Record<CaptionDnaApplyField, string>> = {
    openingHookTypes: JSON.stringify(
      Object.entries(observation.hookDistribution)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .map(([k]) => k)
    ),
    lengthRange: JSON.stringify(observation.captionLength),
    emojiPolicy: observation.emoji.policy,
    lineBreakPattern: observation.paragraphPattern,
  };
  const cta = dominantKey(observation.ctaEndingDistribution);
  if (cta && cta !== "yok") values.ctaStyle = cta;
  return values;
}

export async function applyObservationToCaptionDna(input: {
  accountHandle: string;
  selectedFields: CaptionDnaApplyField[];
  expectedVersion: number | null;
  observation: InstagramDnaObservation;
}): Promise<ApplyResult> {
  const { accountHandle, selectedFields, expectedVersion, observation } = input;
  if (selectedFields.length === 0) {
    return { ok: false, code: "empty_selection", message: "Seçili alan yok — mutation yapılmadı." };
  }
  if (observation.sampleSufficiency !== "sufficient") {
    return {
      ok: false,
      code: "insufficient_evidence",
      message: `Örneklem yetersiz (${observation.evidenceCount}) — gözlem DNA'ya uygulanamaz.`,
    };
  }
  const derived = deriveCaptionDnaValues(observation);
  const missing = selectedFields.filter((f) => derived[f] === undefined);
  if (missing.length > 0) {
    return {
      ok: false,
      code: "insufficient_evidence",
      message: `Şu alanlar için kanıt yok: ${missing.join(", ")}.`,
    };
  }

  const data: Record<string, string> = {};
  for (const f of selectedFields) data[f] = derived[f] as string;

  const existing = await prisma.captionDna.findUnique({ where: { accountHandle } });
  const confidence = Math.min(1, observation.evidenceCount / 50);

  if (!existing) {
    const created = await prisma.captionDna.create({
      data: {
        accountHandle,
        ...data,
        provenance: "operator",
        evidenceCount: observation.evidenceCount,
        confidence,
      },
    });
    return {
      ok: true,
      target: "caption_dna",
      appliedFields: selectedFields,
      version: created.version,
      alreadyApplied: false,
    };
  }

  const alreadyApplied = selectedFields.every(
    (f) => (existing as unknown as Record<string, string>)[f] === data[f]
  );
  if (expectedVersion !== existing.version) {
    if (alreadyApplied) {
      // Aynı onayın retry'ı: değerler zaten yazılmış — duplicate version yok.
      return {
        ok: true,
        target: "caption_dna",
        appliedFields: selectedFields,
        version: existing.version,
        alreadyApplied: true,
      };
    }
    return {
      ok: false,
      code: "version_conflict",
      message: `CaptionDna sürümü değişti (beklenen ${expectedVersion ?? "yok"}, mevcut ${existing.version}) — gözlemi yenileyip tekrar dene.`,
    };
  }

  const updated = await prisma.captionDna.update({
    where: { accountHandle },
    data: {
      ...data,
      provenance: "operator",
      evidenceCount: observation.evidenceCount,
      confidence,
      version: existing.version + 1,
    },
  });
  return {
    ok: true,
    target: "caption_dna",
    appliedFields: selectedFields,
    version: updated.version,
    alreadyApplied: false,
  };
}

export async function applyObservationToSeriesHashtags(input: {
  seriesId: string;
  expectedVersion: number;
  observation: InstagramDnaObservation;
}): Promise<ApplyResult> {
  const { seriesId, expectedVersion, observation } = input;
  if (observation.sampleSufficiency !== "sufficient") {
    return {
      ok: false,
      code: "insufficient_evidence",
      message: `Örneklem yetersiz (${observation.evidenceCount}) — seri hashtag override'ı uygulanamaz.`,
    };
  }
  const tags = [...observation.hashtag.coreTags, ...observation.hashtag.rotatingTags].slice(0, 20);
  if (tags.length === 0) {
    return {
      ok: false,
      code: "insufficient_evidence",
      message: "Gözlemde hashtag kanıtı yok — uygulanacak değer üretilemedi.",
    };
  }
  const nextJson = JSON.stringify(tags);

  const existing = await prisma.seriesProfile.findUnique({ where: { id: seriesId } });
  if (!existing) return { ok: false, code: "not_found", message: "Seri bulunamadı." };

  const alreadyApplied = existing.hashtagDnaJson === nextJson;
  if (expectedVersion !== existing.version) {
    if (alreadyApplied) {
      return {
        ok: true,
        target: "series_hashtag",
        appliedFields: ["hashtagDnaJson"],
        version: existing.version,
        alreadyApplied: true,
      };
    }
    return {
      ok: false,
      code: "version_conflict",
      message: `Seri sürümü değişti (beklenen ${expectedVersion}, mevcut ${existing.version}).`,
    };
  }

  const updated = await prisma.seriesProfile.update({
    where: { id: seriesId },
    data: {
      hashtagDnaJson: nextJson,
      version: existing.version + 1,
      promptVersion: `v${existing.version + 1}`,
    },
  });
  return {
    ok: true,
    target: "series_hashtag",
    appliedFields: ["hashtagDnaJson"],
    version: updated.version,
    alreadyApplied: false,
  };
}
