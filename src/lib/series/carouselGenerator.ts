import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { createPipelineTrace } from "@/lib/agents/pipeline-runner";
import { getInstagramGenerationGate } from "@/lib/config/productGates";
import { getRuntimeProfile, AccountProfileError } from "@/lib/accounts/profileRepository";
import { buildIdentityMemoryContext } from "@/lib/memory/retrieval";
import { getSeries, getSeriesExamples, buildCarouselPrompt } from "@/lib/series/seriesService";
import { verifyWebsite, type VerificationEvidence } from "@/lib/verify/verifyWebsite";
import { computeReadiness } from "@/lib/reels/dossier-generator";
import { calculateLevenshteinSimilarity } from "@/lib/utils/textSimilarity";
import { wrapUntrustedData } from "@/lib/ai/untrustedData";

/**
 * Carousel bölüm üreticisi (ADR-036, Faz 3B §C) — SeriesProfile format=carousel
 * için PRODUCTION generator. `buildCarouselPrompt` sözleşmesini kullanır.
 *
 * Sıkı kurallar:
 *  - Ürün kapısı (getInstagramGenerationGate) kapalıysa: SIFIR ağ çağrısı
 *    (verifyWebsite dahil), SIFIR DB yazımı, typed blocked sonuç.
 *  - Hesap DB'den çözülür + generation-ready olmalı (hardcoded persona YOK);
 *    başka hesaba fallback yasak.
 *  - Yalnız ONAYLI DNA/MemoryFact (buildIdentityMemoryContext) + ≤5 onaylı
 *    seri örneği; topic/örnek/kanıt untrusted fence içinde.
 *  - Araç adlıysa kanıt LLM'den ÖNCE; kanıt açılmıyorsa LLM harcaması YAPILMAZ
 *    (fail-closed blocked_evidence).
 *  - Model çıktısı runtime Zod'dan geçmeden ReelDossier'a YAZILMAZ; near-copy
 *    fail-closed (persist yok). Tek başarılı üretim = tek UsageLog
 *    (pipeline-runner üzerinden).
 *  - Provenance ReelDossier kolonu EKLEMEDEN PipelineTrace "provenance"
 *    stage'inde taşınır (rotation doğrulanmadan migration yasak — ADR-036).
 */

export const CAROUSEL_PURPOSE = "ig_carousel";
export const CAROUSEL_POLICY_VERSION = "3B-1";
/** Tek carousel stage'i için muhafazakâr tavan tahmini (per-pass cap kontrolü). */
export const ESTIMATED_CAROUSEL_COST_USD = 0.06;
export const CAROUSEL_SLIDE_WORD_LIMIT = 20;
export const CAROUSEL_HASHTAG_CAP = 15;
const NEAR_COPY_THRESHOLD = 0.85;
const DEDUP_WINDOW_MS = 24 * 3_600_000;

export const CarouselOutputSchema = z.object({
  cover: z.string().trim().min(1).max(300),
  slides: z
    .array(
      z.object({
        n: z.number().int().min(1).max(20),
        copy: z.string().trim().min(1).max(400),
        visual: z.string().max(400).optional().default(""),
      })
    )
    .min(1)
    .max(12),
  caption: z.string().trim().min(1).max(2200),
  hashtags: z.array(z.string().min(2).max(60)).max(30).optional().default([]),
});
export type CarouselOutput = z.infer<typeof CarouselOutputSchema>;

export type CarouselIssue = { code: string; message: string };

export type CarouselGenerationInput = {
  accountId: string;
  seriesKey: string;
  topic: string;
  sourceHandoffId?: string;
  tool?: { name: string; url: string };
  expectedSeriesVersion: number;
  expectedPromptVersion: string;
};

export type CarouselGenerationResult =
  | { status: "blocked_gate"; missing: string[] }
  | { status: "blocked_budget"; message: string }
  | { status: "account_invalid"; code: string; message: string }
  | { status: "series_not_found"; message: string }
  | { status: "series_conflict"; message: string }
  | { status: "blocked_evidence"; reason: string }
  | { status: "already_exists"; dossierId: string }
  | { status: "invalid_output"; issues: CarouselIssue[]; costUsd: number }
  | {
      status: "created";
      dossierId: string;
      issues: CarouselIssue[];
      costUsd: number;
      contentHash: string;
      warnings: string[];
    };

export function parseSlideCountRange(raw: string): { min: number; max: number } | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const max = Number(m[2]);
  if (min < 1 || max < min) return null;
  return { min, max };
}

export function normalizeHashtags(raw: string[]): string[] {
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().toLowerCase();
    if (tag === "") continue;
    const withHash = tag.startsWith("#") ? tag : `#${tag}`;
    if (!/^#[\p{L}\p{N}_]+$/u.test(withHash)) continue;
    if (!out.includes(withHash)) out.push(withHash);
    if (out.length >= CAROUSEL_HASHTAG_CAP) break;
  }
  return out;
}

function safeArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function carouselCanonicalText(output: CarouselOutput): string {
  return [output.cover, ...output.slides.map((s) => s.copy), output.caption].join("\n");
}

export function carouselContentHash(output: CarouselOutput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        cover: output.cover,
        slides: output.slides.map((s) => ({ n: s.n, copy: s.copy, visual: s.visual })),
        caption: output.caption,
        hashtags: output.hashtags,
      })
    )
    .digest("hex");
}

/** Kanıtsızken sayı/fiyat/ücretsiz iddiası — deterministik tarama. */
const UNVERIFIED_CLAIM_RE =
  /(\d+\s*(tl|₺|\$|usd|dolar|euro|€))|(%\s*\d+)|(\b(ücretsiz|bedava|free)\b)/iu;

/**
 * Saf deterministik doğrulama (ADR-036 §C). `fatal` kodlar persist edilmez
 * (near_copy); diğerleri creative readiness'e taşınır.
 */
export function validateCarouselCandidate(input: {
  output: CarouselOutput;
  slideCountRange: string;
  bannedRepetitionJson: string;
  pastTopicsJson: string;
  topic: string;
  examples: string[];
  hasEvidence: boolean;
}): CarouselIssue[] {
  const issues: CarouselIssue[] = [];
  const { output } = input;

  const range = parseSlideCountRange(input.slideCountRange);
  if (range && (output.slides.length < range.min || output.slides.length > range.max)) {
    issues.push({
      code: "slide_count_out_of_range",
      message: `Slayt sayısı ${output.slides.length}, seri aralığı ${input.slideCountRange}.`,
    });
  }

  const ns = output.slides.map((s) => s.n);
  const contiguous = ns.every((n, i) => n === i + 1);
  if (!contiguous) {
    issues.push({ code: "slide_numbering", message: "Slayt numaraları 1'den başlayıp ardışık olmalı." });
  }

  for (const s of output.slides) {
    const words = s.copy.trim().split(/\s+/).filter(Boolean).length;
    if (words > CAROUSEL_SLIDE_WORD_LIMIT) {
      issues.push({
        code: "slide_word_limit",
        message: `Slayt ${s.n} ${words} kelime (limit ${CAROUSEL_SLIDE_WORD_LIMIT}).`,
      });
    }
  }

  // Tekrar yasakları: yalnız literal ifade eşleşmesi (meta kurallar taranamaz).
  const allText = carouselCanonicalText(output).toLowerCase();
  for (const banned of safeArray(input.bannedRepetitionJson)) {
    const phrase = banned.toLowerCase().replace(/^['"]|['"]$/g, "");
    if (phrase.length >= 6 && !phrase.includes("son 30") && allText.includes(phrase)) {
      issues.push({ code: "banned_repetition", message: `Yasaklı ifade geçiyor: "${banned}".` });
    }
  }

  // Geçmiş bölüm konusu birebir tekrarı.
  const normTopic = input.topic.trim().toLowerCase();
  for (const past of safeArray(input.pastTopicsJson)) {
    if (past.trim().toLowerCase() === normTopic) {
      issues.push({ code: "past_topic_repeat", message: "Bu konu seride daha önce işlendi." });
      break;
    }
  }

  // Near-copy — FAIL-CLOSED (fatal): few-shot örneğine ≥%85 benzerlik.
  const candidate = carouselCanonicalText(output);
  for (const ex of input.examples) {
    if (ex.trim() === "") continue;
    if (calculateLevenshteinSimilarity(candidate, ex) >= NEAR_COPY_THRESHOLD) {
      issues.push({
        code: "near_copy",
        message: "Çıktı bir seri örneğine birebir/yakın kopya — üretim reddedildi.",
      });
      break;
    }
  }

  // Kanıtsız somut fiyat/ücretsiz/istatistik iddiası.
  if (!input.hasEvidence && UNVERIFIED_CLAIM_RE.test(candidate)) {
    issues.push({
      code: "unverified_claim",
      message: "Kanıt olmadan fiyat/ücretsiz/istatistik iddiası — düzenlenmeden onaylanamaz.",
    });
  }

  return issues;
}

export const FATAL_ISSUE_CODES = new Set(["near_copy"]);

function accountInvalid(code: string, message: string): CarouselGenerationResult {
  return { status: "account_invalid", code, message };
}

export async function generateCarouselEpisode(
  input: CarouselGenerationInput
): Promise<CarouselGenerationResult> {
  // 1) Ürün kapısı — kapalıysa sıfır ağ + sıfır DB.
  const gate = getInstagramGenerationGate();
  if (!gate.allowed) return { status: "blocked_gate", missing: gate.missing };
  if (ESTIMATED_CAROUSEL_COST_USD > gate.maxUsd) {
    return {
      status: "blocked_budget",
      message: `Tahmini maliyet $${ESTIMATED_CAROUSEL_COST_USD.toFixed(2)} per-pass tavanı aşıyor.`,
    };
  }

  // 2) Hesap: DB + generation-ready (fallback yok).
  const account = await prisma.account.findUnique({
    where: { id: input.accountId },
    select: { id: true, handle: true, isActive: true },
  });
  if (!account || !account.isActive) {
    return accountInvalid("unknown_or_inactive", "Hesap bulunamadı veya pasif.");
  }
  try {
    await getRuntimeProfile(account.handle, { requireGenerationReady: true });
  } catch (e) {
    const code = e instanceof AccountProfileError ? e.code : "profile_error";
    return accountInvalid(code, "Hesap üretime hazır değil.");
  }

  // 3) Seri: aynı hesapta aktif + sürüm snapshot eşleşmesi.
  const series = await getSeries(input.accountId, input.seriesKey);
  if (!series) return { status: "series_not_found", message: "Aktif seri bulunamadı." };
  if (
    series.version !== input.expectedSeriesVersion ||
    series.promptVersion !== input.expectedPromptVersion
  ) {
    return {
      status: "series_conflict",
      message: `Seri sürümü değişti (beklenen v${input.expectedSeriesVersion}/${input.expectedPromptVersion}, mevcut v${series.version}/${series.promptVersion}).`,
    };
  }

  // 4) Aynı handoff/konu retry'ı duplicate dossier üretmez (24s pencere).
  const title = input.topic.slice(0, 200);
  const existing = await prisma.reelDossier.findFirst({
    where: {
      accountId: input.accountId,
      title,
      format: "carousel",
      createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (existing) return { status: "already_exists", dossierId: existing.id };

  // 5) Kanıt LLM'den ÖNCE; araç adlı + kanıt yok → LLM harcaması YOK.
  const toolNamed = Boolean(input.tool?.name && input.tool?.url);
  let evidence: VerificationEvidence | null = null;
  let verificationId: string | null = null;
  if (toolNamed) {
    const v = await verifyWebsite(input.tool!.url, { persist: true });
    if (!v.ok) return { status: "blocked_evidence", reason: v.reason };
    evidence = v.evidence;
    verificationId = v.verificationId ?? null;
  }
  const finalReadiness = computeReadiness({ toolNamed, evidence });

  // 6) Yalnız ONAYLI grounding: identity bloğu (fail-soft) + ≤5 onaylı örnek.
  let voiceLines: string[] = [];
  try {
    const ctx = await buildIdentityMemoryContext(account.handle);
    if (ctx.block.trim() !== "") voiceLines = [ctx.block];
  } catch {
    /* identity bloğu fail-soft — seri sözleşmesi tek başına yeterli */
  }
  const exampleRows = await getSeriesExamples(input.accountId, input.seriesKey);
  const examples = exampleRows.map((e) => e.outputContent).filter((t) => t.trim() !== "");

  const evidenceNote = evidence
    ? `\nDoğrulanmış araç kanıtı (yalnız bunları kullan): ${JSON.stringify({
        tool: input.tool,
        opens: evidence.opens,
        finalUrl: evidence.finalUrl,
        freeTier: evidence.freeTier,
        signupRequired: evidence.signupRequired,
      })}`
    : toolNamed
      ? ""
      : "\nAraç kanıtı yok — fiyat/ücretsiz/istatistik iddiası ÜRETME.";

  const prompt = buildCarouselPrompt({
    series,
    voiceLines,
    examples,
    topic: `${input.topic}${evidenceNote}`,
  });

  // 7) Tek LLM stage'i (pipeline-runner → tam 1 UsageLog + trace girdisi).
  const dossierId = crypto.randomUUID();
  const trace = createPipelineTrace({
    platform: "instagram",
    pipelineId: CAROUSEL_PURPOSE,
    subjectType: "reel_dossier",
    subjectId: dossierId,
  });

  let costUsd = 0;
  let rawData: unknown;
  const warnings: string[] = [];
  try {
    const r = await trace.runStage<unknown>({
      stage: "carousel",
      role: "premiumCreative",
      roleFallback: ["creativeWriter"],
      temperature: 0.8,
      system: prompt.system,
      user: prompt.user,
    });
    costUsd = r.actualCostUsd;
    rawData = r.data;
  } catch (e) {
    await trace.flush(costUsd);
    return {
      status: "invalid_output",
      issues: [{ code: "generation_failed", message: e instanceof Error ? e.message : String(e) }],
      costUsd,
    };
  }
  if (costUsd > gate.maxUsd) {
    warnings.push(`over_cap: gerçek maliyet $${costUsd.toFixed(4)} tavanı aştı — raporlandı.`);
  }

  // 8) Runtime Zod — geçmeden HİÇBİR production kaydı yazılmaz.
  const parsed = CarouselOutputSchema.safeParse(rawData);
  if (!parsed.success) {
    await trace.flush(costUsd);
    return {
      status: "invalid_output",
      issues: [{ code: "schema_invalid", message: "Model çıktısı şemadan geçmedi." }],
      costUsd,
    };
  }
  const output: CarouselOutput = {
    ...parsed.data,
    hashtags: normalizeHashtags(parsed.data.hashtags),
  };

  // 9) Deterministik doğrulama; near_copy FAIL-CLOSED (persist yok).
  const issues = validateCarouselCandidate({
    output,
    slideCountRange: series.slideCountRange,
    bannedRepetitionJson: series.bannedRepetitionJson,
    pastTopicsJson: series.pastTopicsJson,
    topic: input.topic,
    examples,
    hasEvidence: Boolean(evidence?.opens),
  });
  if (issues.some((i) => FATAL_ISSUE_CODES.has(i.code))) {
    await trace.flush(costUsd);
    return { status: "invalid_output", issues, costUsd };
  }

  // 10) Provenance stage'i (kolon eklemeden — ADR-036) + tek create.
  const contentHash = carouselContentHash(output);
  trace.stages.push({
    stage: "provenance",
    role: "none",
    model: "",
    ok: true,
    failOpenUsed: false,
    ms: 0,
    costUsd: 0,
    policyVersion: CAROUSEL_POLICY_VERSION,
    seriesKey: input.seriesKey,
    seriesVersion: series.version,
    promptVersion: series.promptVersion,
    sourceHandoffId: input.sourceHandoffId,
    contentHash,
    accountId: account.id,
    accountHandle: account.handle,
    outputSchemaVersion: "carousel-v1",
  });

  await prisma.reelDossier.create({
    data: {
      id: dossierId,
      accountId: input.accountId,
      title,
      pillar: input.seriesKey,
      format: "carousel",
      objective: series.objective,
      primaryToolJson: JSON.stringify(input.tool ?? {}),
      verificationId,
      verificationEvidenceJson: JSON.stringify(evidence ?? {}),
      expiry: evidence ? new Date(evidence.expiry) : null,
      cover: output.cover,
      caption: output.caption,
      hashtagGroupJson: JSON.stringify(output.hashtags),
      slidesJson: JSON.stringify(output.slides),
      finalReadiness,
      costUsd,
    },
  });
  await trace.flush(costUsd);

  return { status: "created", dossierId, issues, costUsd, contentHash, warnings };
}
