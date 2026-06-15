/**
 * Brief Konseyi — on-demand 5-aşama pipeline (cron'da ASLA çağrılmaz).
 * Her aşama fail-open: bir aşama patlarsa önceki çıktılar kaydedilir, devam edilir.
 * Bütçe gate LLM'den ÖNCE; her LLM çağrısı UsageLog purpose:"yt_brief" yazar.
 */

import { createPipelineTrace } from "@/lib/agents/pipeline-runner";
import { usageService } from "@/lib/services/usageService";
import { ytBriefRepo } from "@/lib/db/ytBriefRepo";
import { BudgetExceededError } from "@/lib/config/costGate";
import {
  YT_BRIEF_PURPOSE,
  getYtBriefMonthlyBudgetUsd,
  getYtBriefDailyLimit,
} from "./ytConfig";
import type { ViralAnalysis } from "./ytTypes";

export class YtBriefDailyLimitError extends Error {
  readonly code = "yt_daily_limit";
  constructor(
    public readonly count: number,
    public readonly limit: number
  ) {
    super(`Günlük YouTube brief limiti aşıldı: ${count}/${limit}`);
    this.name = "YtBriefDailyLimitError";
  }
}

export type BriefVideoContext = {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  category: string;
};

export type GenerateBriefResult = {
  briefId: string;
  stagesCompleted: number;
  transcriptUsed: boolean;
  costUsd: number;
  warnings: string[];
};

// Ali Cem'in sesi — stage 4 grounding'i (kullanıcı kararı: grafikcem persona).
const VOICE =
  "Sen Ali Cem (grafikcem) için YouTube prodüksiyon stratejistisin. Ali Cem: İstanbul'da " +
  "grafik tasarımcı + AI/sosyal medya içerik üreticisi; pratik-operatör ton, somut araç adı/sayı " +
  "çapası sever, abartısız, Türkçe konuşur.";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function generateBrief(input: {
  video: BriefVideoContext;
  transcript: string | null;
  accountId?: string;
}): Promise<GenerateBriefResult> {
  // ── Bütçe gate (LLM'den ÖNCE) ──
  const spent = await usageService.getMonthlySpendByPurpose("yt_");
  const monthlyBudget = getYtBriefMonthlyBudgetUsd();
  if (spent >= monthlyBudget) throw new BudgetExceededError(spent, monthlyBudget);
  const todayCount = await ytBriefRepo.countCreatedToday();
  const dailyLimit = getYtBriefDailyLimit();
  if (todayCount >= dailyLimit) throw new YtBriefDailyLimitError(todayCount, dailyLimit);

  const { video, transcript } = input;
  const transcriptUsed = typeof transcript === "string" && transcript.length > 0;
  const warnings: string[] = [];
  let costUsd = 0;
  let stagesCompleted = 0;

  const brief = await ytBriefRepo.create({ videoId: video.videoId });
  const briefId = brief.id;

  // Every LLM stage runs through the traced runner → one viewable pipeline izi.
  const trace = createPipelineTrace({
    platform: "youtube",
    pipelineId: YT_BRIEF_PURPOSE,
    subjectType: "yt_video",
    subjectId: video.videoId,
  });

  const metaBlock = [
    `Başlık: ${video.title}`,
    `Kanal: ${video.channelTitle}`,
    `Kategori: ${video.category}`,
    `Açıklama: ${(video.description || "").slice(0, 1500)}`,
    transcriptUsed
      ? `Transkript:\n${transcript.slice(0, 8000)}`
      : "Transkript: YOK (sadece metadata temelli analiz).",
  ].join("\n");

  const logSpend = async (r: { actualCostUsd: number; model: string }): Promise<void> => {
    costUsd += r.actualCostUsd;
    await usageService.recordOpenRouter({
      accountId: input.accountId,
      estimatedCostUsd: r.actualCostUsd,
      model: r.model,
      meta: { purpose: YT_BRIEF_PURPOSE, videoId: video.videoId },
      platform: "youtube",
    });
  };

  // ── Aşama 1: viralJudge — neden patladı + kanal personası ──
  let analysis: ViralAnalysis | null = null;
  try {
    const r = await trace.runStage<ViralAnalysis>({
      stage: "analiz",
      role: "viralJudge",
      temperature: 0.4,
      system: `${VOICE}\nBir rakip videonun neden patladığını çöz. Sadece JSON döndür.`,
      user: `${metaBlock}\n\nJSON şeması: {"whyItWorked":"...","hookPattern":"...","channelPersona":"...","structure":"..."}`,
    });
    analysis = r.data;
    await logSpend(r);
    stagesCompleted++;
  } catch (e) {
    warnings.push(`stage1_analiz: ${msg(e)}`);
  }

  // ── Aşama 2: qualityJudge — fark analizi + pillar ──
  let differentiation = "";
  let pillar = "";
  try {
    const r = await trace.runStage<{ differentiationAnalysis: string; pillar: string }>({
      stage: "fark",
      role: "qualityJudge",
      temperature: 0.5,
      system: `${VOICE}\nRakip videoya karşı Ali Cem NASIL farklılaşır ve hangi içerik sütununa (pillar) oturur? Sadece JSON.`,
      user: `${metaBlock}\n\nRakip analizi: ${JSON.stringify(analysis ?? {})}\n\nJSON: {"differentiationAnalysis":"...","pillar":"..."}`,
    });
    differentiation = r.data.differentiationAnalysis ?? "";
    pillar = r.data.pillar ?? "";
    await logSpend(r);
    await ytBriefRepo.update(briefId, { differentiationAnalysis: differentiation, pillar });
    stagesCompleted++;
  } catch (e) {
    warnings.push(`stage2_fark: ${msg(e)}`);
  }

  // ── Aşama 3: creativeWriter — iskelet (outline + başlıklar + thumbnail + SEO) ──
  let outlineJson = "[]";
  try {
    const r = await trace.runStage<{
      outline: unknown[];
      titleVariants: string[];
      thumbnailConcept: string;
      seoDescription: string;
    }>({
      stage: "iskelet",
      role: "creativeWriter",
      temperature: 0.85,
      system: `${VOICE}\nVideo iskeleti üret: bölümler, 5-8 başlık varyantı, thumbnail konsepti, SEO açıklaması. Türkçe. Sadece JSON.`,
      user: `${metaBlock}\n\nFark: ${differentiation}\nPillar: ${pillar}\n\nJSON: {"outline":[{"heading":"...","targetSec":60,"talkingPoints":["..."]}],"titleVariants":["..."],"thumbnailConcept":"...","seoDescription":"..."}`,
    });
    outlineJson = JSON.stringify(r.data.outline ?? []);
    await logSpend(r);
    await ytBriefRepo.update(briefId, {
      outlineJson,
      titleVariantsJson: JSON.stringify(r.data.titleVariants ?? []),
      thumbnailConcept: r.data.thumbnailConcept ?? "",
      seoDescription: r.data.seoDescription ?? "",
    });
    stagesCompleted++;
  } catch (e) {
    warnings.push(`stage3_iskelet: ${msg(e)}`);
  }

  // ── Aşama 4: premiumCreative (throw → creativeWriter) — TAM konuşma metni ──
  let fullScript = "";
  try {
    const sys = `${VOICE}\nBölüm bölüm TAM konuşma metni yaz — kelime kelime, kameraya konuşur gibi, Ali Cem'in sesiyle. İlk 30sn hook ayrı. Türkçe. Sadece JSON.`;
    const usr = `${metaBlock}\n\nİskelet: ${outlineJson}\nFark: ${differentiation}\nRakip analizi: ${JSON.stringify(
      analysis ?? {}
    )}\n\nJSON: {"hookScript":"ilk 30sn kelime kelime","fullScript":"bölüm bölüm TAM metin"}`;
    const r = await trace.runStage<{ hookScript: string; fullScript: string }>({
      stage: "tammetin",
      role: "premiumCreative",
      roleFallback: ["creativeWriter"],
      temperature: 0.85,
      system: sys,
      user: usr,
    });
    fullScript = r.data.fullScript ?? "";
    await logSpend(r);
    await ytBriefRepo.update(briefId, {
      hookScript: r.data.hookScript ?? "",
      fullScript,
      modelUsed: r.model,
    });
    stagesCompleted++;
  } catch (e) {
    warnings.push(`stage4_tammetin: ${msg(e)}`);
  }

  // ── Aşama 5: finalEditor — Türkçe cila + çekim/edit notları ──
  if (fullScript) {
    try {
      const r = await trace.runStage<{
        fullScript: string;
        editingNotes: string;
        shootingNotes: string;
      }>({
        stage: "cila",
        role: "finalEditor",
        temperature: 0.4,
        system: `${VOICE}\nKonuşma metnini Türkçe akıcılık için cilala; çekim notları ve edit önerileri ekle. Sadece JSON.`,
        user: `Metin:\n${fullScript.slice(0, 12000)}\n\nJSON: {"fullScript":"cilalı tam metin","editingNotes":"...","shootingNotes":"..."}`,
      });
      await logSpend(r);
      await ytBriefRepo.update(briefId, {
        fullScript: r.data.fullScript || fullScript,
        editingNotes: r.data.editingNotes ?? "",
        shootingNotes: r.data.shootingNotes ?? "",
      });
      stagesCompleted++;
    } catch (e) {
      warnings.push(`stage5_cila: ${msg(e)}`);
    }
  }

  if (!transcriptUsed) warnings.push("transcript_unavailable");

  await ytBriefRepo.update(briefId, {
    transcriptUsed,
    sourceTranscript: transcriptUsed ? transcript.slice(0, 20000) : "",
    costUsd,
  });

  await trace.flush(costUsd);

  return { briefId, stagesCompleted, transcriptUsed, costUsd, warnings };
}
