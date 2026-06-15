import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";
import {
  type WeeklyLearningReportInput,
  type WeeklyLearningReportInputRaw,
  type WeeklyLearningReport,
  type AccountLearningSummary,
  type PatternLearningInsight,
  type FeedbackLearningInsight,
  type QueueLearningInsight,
  type PlatformLearningSection
} from "./types";

type CriticScores = {
  publishScore: number;
  personaMatchScore: number;
  hookStrengthScore: number;
  clarityScore: number;
  viralityScore: number;
  noveltyScore: number;
  riskScore: number;
  publishRecommendation: string;
  rewriteSuggestion: string;
  angle: string;
  reasoning: string;
  patternUsed?: string;
};

// ---------------------------------------------------------------------------
// 1. safeParseQueueScores — parse SQLite scores JSON safely
// ---------------------------------------------------------------------------
export function safeParseQueueScores(scoresJson: string | null | undefined): CriticScores {
  const fallback: CriticScores = {
    publishScore: 75,
    personaMatchScore: 75,
    hookStrengthScore: 75,
    clarityScore: 75,
    viralityScore: 75,
    noveltyScore: 75,
    riskScore: 20,
    publishRecommendation: "publish",
    rewriteSuggestion: "",
    angle: "safe",
    reasoning: "Standard draft in queue"
  };

  if (!scoresJson) return fallback;
  try {
    const parsed = typeof scoresJson === "string" ? JSON.parse(scoresJson) : scoresJson;
    return {
      publishScore: typeof parsed.publishScore === "number" ? parsed.publishScore : 75,
      personaMatchScore: typeof parsed.personaMatchScore === "number" ? parsed.personaMatchScore : 75,
      hookStrengthScore: typeof parsed.hookStrengthScore === "number" ? parsed.hookStrengthScore : 75,
      clarityScore: typeof parsed.clarityScore === "number" ? parsed.clarityScore : 75,
      viralityScore: typeof parsed.viralityScore === "number" ? parsed.viralityScore : 75,
      noveltyScore: typeof parsed.noveltyScore === "number" ? parsed.noveltyScore : 75,
      riskScore: typeof parsed.riskScore === "number" ? parsed.riskScore : 20,
      publishRecommendation: parsed.publishRecommendation || "publish",
      rewriteSuggestion: parsed.rewriteSuggestion || "",
      angle: parsed.angle || "safe",
      reasoning: parsed.reasoning || "Standard draft in queue",
      patternUsed: parsed.patternUsed
    };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 2. calculateAverageScore — safely average numeric arrays
// ---------------------------------------------------------------------------
export function calculateAverageScore<T>(
  items: T[],
  selector: (item: T) => number | null | undefined
): number | null {
  if (items.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const item of items) {
    const val = selector(item);
    if (val !== null && val !== undefined && !isNaN(val)) {
      sum += val;
      count++;
    }
  }
  return count > 0 ? Math.round(sum / count) : null;
}

// ---------------------------------------------------------------------------
// 3. resolveLearningDateRange — resolve LearningReportDateRange string
// ---------------------------------------------------------------------------
export function resolveLearningDateRange(input: WeeklyLearningReportInputRaw): {
  from: Date;
  to: Date;
  label: string;
} {
  const now = new Date();
  
  // startOfToday at 00:00:00.000 local time
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  let fromDate: Date;
  let toDate: Date = endOfToday;
  let label = "Son 7 Gün";
  
  const dateRange = input.dateRange || "last_7_days";
  
  if (dateRange === "last_7_days") {
    fromDate = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    label = "Son 7 Gün";
  } else if (dateRange === "last_30_days") {
    fromDate = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    label = "Son 30 Gün";
  } else if (dateRange === "this_week") {
    // start of current week (Monday)
    const day = startOfToday.getDay();
    const diff = startOfToday.getDate() - day + (day === 0 ? -6 : 1);
    fromDate = new Date(startOfToday.setDate(diff));
    label = "Bu Hafta";
  } else if (dateRange === "previous_week") {
    const day = startOfToday.getDay();
    const diff = startOfToday.getDate() - day + (day === 0 ? -6 : 1) - 7;
    fromDate = new Date(startOfToday.setDate(diff));
    toDate = new Date(fromDate.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    label = "Geçen Hafta";
  } else if (dateRange === "all") {
    fromDate = new Date(0); // beginning of time
    label = "Tüm Zamanlar";
  } else if (dateRange === "custom") {
    if (!input.from || !input.to) {
      throw new Error("Custom date range requires 'from' and 'to' parameters.");
    }
    fromDate = new Date(input.from);
    toDate = new Date(input.to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new Error("Invalid custom date range parameters.");
    }
    label = `Özel Aralık (${fromDate.toLocaleDateString("tr-TR")} - ${toDate.toLocaleDateString("tr-TR")})`;
  } else {
    fromDate = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    label = "Son 7 Gün";
  }
  
  return { from: fromDate, to: toDate, label };
}

// ---------------------------------------------------------------------------
// 4. buildAccountLearningSummaries — calculate accounts breakdown
// ---------------------------------------------------------------------------
export function buildAccountLearningSummaries(
  accounts: any[],
  feedbackEvents: any[],
  trainingExamples: any[],
  queueItems: any[],
  patterns: any[]
): AccountLearningSummary[] {
  const handles: ("grafikcem" | "maskulenkod")[] = ["grafikcem", "maskulenkod"];
  
  return handles.map((handle) => {
    const acc = accounts.find((a) => a.handle === handle);
    if (!acc) {
      return {
        accountHandle: handle,
        totalFeedbackEvents: 0,
        totalTrainingExamples: 0,
        approvedCount: 0,
        rejectedCount: 0,
        editedCount: 0,
        savedPatternCount: 0,
        tooAiCount: 0,
        notMyToneCount: 0,
        hookWeakCount: 0,
        averagePublishScore: null,
        averageRiskScore: null,
        recommendation: "Hesap profili bulunamadı."
      };
    }

    const accFeedbacks = feedbackEvents.filter((f) => f.accountId === acc.id);
    const accTraining = trainingExamples.filter((t) => t.accountId === acc.id);
    const accQueue = queueItems.filter((q) => q.accountId === acc.id);
    const accPatterns = patterns.filter((p) => p.accountId === acc.id);

    const approvedCount = accFeedbacks.filter((f) => f.feedbackType === "approved" || f.feedbackType === "edited").length;
    const rejectedCount = accFeedbacks.filter((f) => f.feedbackType === "rejected").length;
    const editedCount = accFeedbacks.filter((f) => f.feedbackType === "edited").length;
    const savedPatternCount = accFeedbacks.filter((f) => f.feedbackType === "saved_as_pattern").length;
    const tooAiCount = accFeedbacks.filter((f) => f.feedbackType === "too_ai").length;
    const notMyToneCount = accFeedbacks.filter((f) => f.feedbackType === "not_my_tone").length;
    const hookWeakCount = accFeedbacks.filter((f) => f.feedbackType === "hook_weak").length;

    // Parse and average queue scores
    const enrichedQueue = accQueue.map((q) => safeParseQueueScores(q.scores));
    const averagePublishScore = calculateAverageScore(enrichedQueue, (eq) => eq.publishScore);
    const averageRiskScore = calculateAverageScore(enrichedQueue, (eq) => eq.riskScore);

    // Identify best pattern by successScore
    const usedPatterns = accPatterns.filter((p) => p.usageCount > 0);
    usedPatterns.sort((a, b) => b.successScore - a.successScore || b.usageCount - a.usageCount);
    const bestPatternName = usedPatterns[0]?.patternName || undefined;

    // Detect weakest performance signal
    let weakestSignal: string | undefined;
    if (tooAiCount > 2) weakestSignal = "Yapay zeka kokan dil (Too AI)";
    else if (notMyToneCount > 2) weakestSignal = "Persona ton uyuşmazlığı (Not My Tone)";
    else if (hookWeakCount > 2) weakestSignal = "Zayıf giriş cümleleri (Hook Weak)";
    else if (rejectedCount > 2) weakestSignal = "Yüksek taslak ret oranı";

    // Set targeted recommendation
    let recommendation = "İçerik üretim kalitesi dengeli. Viral şablonları daha sık kullanın.";
    if (tooAiCount > 0) {
      recommendation = "Daha samimi ve insan yazmış gibi duran cümle yapıları kurun. Ağdalı yapay kelimeleri yasaklılar listesine ekleyin.";
    } else if (notMyToneCount > 0) {
      recommendation = "Persona kurallarını gözden geçirin. Seçilen modun tona uyumunu Scorer parametrelerinden sıkılaştırın.";
    } else if (hookWeakCount > 0) {
      recommendation = "İlk cümlede soru sorma veya zıtlık kurma gibi kanca pattern'lerini tercih edin.";
    } else if (rejectedCount > tooAiCount + notMyToneCount && rejectedCount > 0) {
      recommendation = "Draft Generator parametrelerini veya kaynak seçim kriterlerini daraltın.";
    }

    return {
      accountHandle: handle,
      totalFeedbackEvents: accFeedbacks.length,
      totalTrainingExamples: accTraining.length,
      approvedCount,
      rejectedCount,
      editedCount,
      savedPatternCount,
      tooAiCount,
      notMyToneCount,
      hookWeakCount,
      averagePublishScore,
      averageRiskScore,
      bestPatternName,
      weakestSignal,
      recommendation
    };
  });
}

// ---------------------------------------------------------------------------
// 5. buildPatternInsights — top/weak patterns analysis
// ---------------------------------------------------------------------------
export function buildPatternInsights(
  patterns: any[],
  queueItems: any[],
  accounts: any[]
): { top: PatternLearningInsight[]; weak: PatternLearningInsight[] } {
  const accountMap = new Map(accounts.map((a) => [a.id, a.handle]));
  
  const insights = patterns.map((p) => {
    const handle = accountMap.get(p.accountId) || "unknown";
    
    // Parse queue scores matching this pattern name
    const matchingQueue = queueItems.filter((q) => {
      const parsed = safeParseQueueScores(q.scores);
      return parsed.patternUsed === p.patternName;
    });

    const enrichedQueue = matchingQueue.map((q) => safeParseQueueScores(q.scores));
    const averagePublishScore = calculateAverageScore(enrichedQueue, (eq) => eq.publishScore);

    // Determine performance signal
    let signal: "rising" | "stable" | "weak" | "unknown" = "unknown";
    let reason = "Şablon kullanım verisi yetersiz.";

    if (p.usageCount > 0) {
      if (p.successScore >= 75) {
        signal = "rising";
        reason = "Kullanıcı etkileşimi ve yayın skorları yüksek seyrediyor.";
      } else if (p.successScore <= 45) {
        signal = "weak";
        reason = "Tona uyum zayıf veya editör tarafından sıkça reddediliyor.";
      } else {
        signal = "stable";
        reason = "Performans dengeli, taslak üretimine düzenli katkı sağlıyor.";
      }
    }

    return {
      patternId: p.id,
      patternName: p.patternName,
      accountHandle: handle,
      usageCount: p.usageCount,
      successScore: p.successScore,
      averagePublishScore,
      signal,
      reason
    };
  });

  // Filter top vs weak
  const top = insights.filter((i) => i.signal === "rising").sort((a, b) => b.successScore - a.successScore).slice(0, 5);
  const weak = insights.filter((i) => i.signal === "weak").sort((a, b) => a.successScore - b.successScore).slice(0, 5);

  return { top, weak };
}

// ---------------------------------------------------------------------------
// 6. buildFeedbackInsights — evaluate feedback categories
// ---------------------------------------------------------------------------
export function buildFeedbackInsights(feedbackEvents: any[]): FeedbackLearningInsight[] {
  const feedbackTypes = ["too_ai", "not_my_tone", "hook_weak", "rejected", "edited"];
  
  const rawInsights = feedbackTypes.map((type) => {
    const count = feedbackEvents.filter((f) => f.feedbackType === type).length;
    let interpretation = "Veri yetersiz.";

    if (count > 0) {
      switch (type) {
        case "too_ai":
          interpretation = "Metin dili fazla robotik veya klişe algılanıyor. İnsan cümle yapıları kurulmalı.";
          break;
        case "not_my_tone":
          interpretation = "Seçilen taslak açısı persona ton kurallarına uymuyor. Persona tanımları daraltılmalı.";
          break;
        case "hook_weak":
          interpretation = "Kancalar okuyucu dikkatini çekmekte zayıf kalıyor. Soru veya zıtlık şablonları artırılmalı.";
          break;
        case "rejected":
          interpretation = "Editör taslak üretimini yüksek oranda eliyor. Filtre hassasiyeti artırılmalı.";
          break;
        case "edited":
          interpretation = "Taslaklar ana fikir olarak iyi ancak final tonu için manuel düzeltme gerekiyor.";
          break;
      }
    } else {
      switch (type) {
        case "too_ai":
          interpretation = "Yapay zeka dil kalitesi mükemmel durumda.";
          break;
        case "not_my_tone":
          interpretation = "Persona ton uyumu tamamen dengeli seyrediyor.";
          break;
        case "hook_weak":
          interpretation = "Taslak kancaları okuyucu için son derece çekici.";
          break;
        default:
          interpretation = "Herhangi bir problem raporlanmadı.";
          break;
      }
    }

    return {
      feedbackType: type,
      count,
      accountHandle: "all" as const,
      interpretation
    };
  });

  return rawInsights.filter((i) => i.count > 0 || i.interpretation !== "Veri yetersiz.");
}

// ---------------------------------------------------------------------------
// 7. buildQueueInsight — calculate queue metadata analysis
// ---------------------------------------------------------------------------
export function buildQueueInsight(queueItems: any[]): QueueLearningInsight {
  const enriched = queueItems.map((q) => safeParseQueueScores(q.scores));

  const totalQueueItems = queueItems.length;
  const draftCount = queueItems.filter((q) => q.status === "new" || q.status === "draft").length;
  const approvedCount = queueItems.filter((q) => q.status === "approved").length;
  const rejectedCount = queueItems.filter((q) => q.status === "rejected").length;
  const scheduledCount = queueItems.filter((q) => q.status === "scheduled").length;

  const averagePublishScore = calculateAverageScore(enriched, (eq) => eq.publishScore);
  const averageRiskScore = calculateAverageScore(enriched, (eq) => eq.riskScore);

  const highRiskCount = enriched.filter((eq) => eq.riskScore >= 70).length;
  const lowScoreCount = enriched.filter((eq) => eq.publishScore < 50).length;

  return {
    totalQueueItems,
    draftCount,
    approvedCount,
    rejectedCount,
    scheduledCount,
    averagePublishScore,
    averageRiskScore,
    highRiskCount,
    lowScoreCount
  };
}

// ---------------------------------------------------------------------------
// 8. buildNextWeekActions — generate up to 5 net actions
// ---------------------------------------------------------------------------
export function buildNextWeekActions(
  summaries: AccountLearningSummary[],
  feedbackInsights: FeedbackLearningInsight[],
  queueInsight: QueueLearningInsight
): string[] {
  const actions: string[] = [];

  // Rules based actions
  const tooAiTotal = feedbackInsights.find((i) => i.feedbackType === "too_ai")?.count || 0;
  const notMyToneTotal = feedbackInsights.find((i) => i.feedbackType === "not_my_tone")?.count || 0;
  const hookWeakTotal = feedbackInsights.find((i) => i.feedbackType === "hook_weak")?.count || 0;

  if (tooAiTotal > 2) {
    actions.push("Yapay zeka dil kalitesini artırmak için yasaklı kelimeler (cliche terms) listesini güncelleyin.");
  }
  if (notMyToneTotal > 2) {
    actions.push("Persona eşleşmelerini optimize etmek amacıyla account-profiles.ts tonda ince ayar yapın.");
  }
  if (hookWeakTotal > 2) {
    actions.push("Soru ve veri ile açılan hook paternlerinin kullanım frekansını iki katına çıkarın.");
  }
  
  if (queueInsight.highRiskCount > 1) {
    actions.push("Kuyrukta yüksek riskli taslak birikimi var. Critic risk eşiğini daraltıp yeniden değerlendirin.");
  }

  // Account specific triggers
  for (const sum of summaries) {
    if (sum.rejectedCount > 3) {
      actions.push(`@${sum.accountHandle} taslaklarında yüksek ret oranı var; generator prompt sınırlarını sıkılaştırın.`);
    }
  }

  // Fallbacks if nothing triggered or to fill up to 3 actions
  if (actions.length < 3) {
    actions.push("En az 75 başarı skoru alan yükselişteki (rising) patternleri taslak üretiminde önceliklendirin.");
    actions.push("Daily Queue üzerindeki editör kararlarını (approved/rejected) feedback servisine iletmeye devam edin.");
    actions.push("Düşük yayın skoru (<50) olan taslakları yayınlamadan önce mutlaka düzenleyin.");
  }

  return actions.slice(0, 5);
}

// ---------------------------------------------------------------------------
// 9. generateLearningSummaryWithAI — OpenRouter dynamic chat writer summary
// ---------------------------------------------------------------------------
export async function generateLearningSummaryWithAI(report: any): Promise<string> {
  const defaultSummary = `Sistem genelinde ${report.summary.totalFeedbackEvents} geri bildirim ve ${report.summary.totalTrainingExamples} eğitim verisi başarıyla analiz edildi. Ortalama yayın kalitesi %${report.summary.averagePublishScore ?? 75} düzeyinde seyrediyor. Editör düzeltmeleri ton uyumu ve insan kalitesini korumak için optimize edici aksiyonlar üretmeye devam ediyor.`;

  try {
    const { generateJson } = await import("@/lib/ai/openrouter");
    
    const system = "Sen GrafikCem News AI Growth analistisin. Verilen analitik rapor özetinden yola çıkarak haftalık öğrenim gelişimini net ve sade Türkçe ile yorumlayan tek bir paragraf özet (summary) üreteceksin. Yanıtı SADECE JSON formatında {'summary': 'paragraf'} olarak dön.";
    
    const user = `Rapor Verisi: ${JSON.stringify(report.summary)}\nHesaplar: ${JSON.stringify(report.accounts)}`;

    const result = await generateJson<{ summary: string }>({
      role: "cheapWriter",
      system,
      user,
      temperature: 0.2
    });

    return result.data?.summary || defaultSummary;
  } catch {
    return defaultSummary;
  }
}

// ---------------------------------------------------------------------------
// 9b. buildPlatformSections — per-platform learning breakdown (Faz F)
// ---------------------------------------------------------------------------
const REPORT_PLATFORMS = ["x", "instagram", "youtube"] as const;

function buildPlatformSections(
  feedbackEvents: { platform: string; feedbackType: string }[],
  trainingExamples: { platform: string }[],
  patterns: { platform: string }[]
): PlatformLearningSection[] {
  return REPORT_PLATFORMS.map((platform) => {
    const fe = feedbackEvents.filter((f) => f.platform === platform);
    return {
      platform,
      totalFeedbackEvents: fe.length,
      totalTrainingExamples: trainingExamples.filter((t) => t.platform === platform).length,
      totalPatterns: patterns.filter((p) => p.platform === platform).length,
      engagementHigh: fe.filter((f) => f.feedbackType === "engagement_high").length,
      engagementLow: fe.filter((f) => f.feedbackType === "engagement_low").length
    };
  });
}

// ---------------------------------------------------------------------------
// 10. generateWeeklyLearningReport — main report compiler
// ---------------------------------------------------------------------------
export async function generateWeeklyLearningReport(
  input: WeeklyLearningReportInput
): Promise<WeeklyLearningReport> {
  try {
    const resolvedRange = resolveLearningDateRange(input);
    const accounts = await accountRepo.findAll();
    
    // DB query filters
    const whereClause: any = {
      createdAt: {
        gte: resolvedRange.from,
        lte: resolvedRange.to
      }
    };

    const [feedbackEvents, trainingExamples, rawQueueItems, rawPatterns] = await Promise.all([
      prisma.feedbackEvent.findMany({ where: whereClause, orderBy: { createdAt: "desc" } }),
      prisma.trainingExample.findMany({ where: whereClause, orderBy: { createdAt: "desc" } }),
      prisma.queueItem.findMany({ where: whereClause, orderBy: { createdAt: "desc" } }),
      prisma.viralPattern.findMany({ orderBy: { successScore: "desc" } })
    ]);

    // Build sub insights
    const enrichedQueue = rawQueueItems.map((q) => safeParseQueueScores(q.scores));
    const averagePublishScore = calculateAverageScore(enrichedQueue, (eq) => eq.publishScore);
    const averageRiskScore = calculateAverageScore(enrichedQueue, (eq) => eq.riskScore);

    const summaries = buildAccountLearningSummaries(
      accounts,
      feedbackEvents,
      trainingExamples,
      rawQueueItems,
      rawPatterns
    );

    const { top: topPatterns, weak: weakPatterns } = buildPatternInsights(rawPatterns, rawQueueItems, accounts);
    const feedbackInsights = buildFeedbackInsights(feedbackEvents);
    const queueInsight = buildQueueInsight(rawQueueItems);
    const nextWeekActions = buildNextWeekActions(summaries, feedbackInsights, queueInsight);

    // Identify strongest vs weakest accounts
    const activeSummaries = summaries.filter((s) => s.averagePublishScore !== null);
    let strongestAccount: any;
    let weakestAccount: any;

    if (activeSummaries.length > 0) {
      activeSummaries.sort((a, b) => (b.averagePublishScore || 0) - (a.averagePublishScore || 0));
      strongestAccount = activeSummaries[0]?.accountHandle;
      weakestAccount = activeSummaries[activeSummaries.length - 1]?.accountHandle;
      if (strongestAccount === weakestAccount && activeSummaries.length === 1) {
        weakestAccount = undefined;
      }
    }

    const totalPatterns = rawPatterns.length;

    const topRecommendation = summaries.find((s) => s.accountHandle === weakestAccount)?.recommendation || 
      "Şablon başarı skorlarını izleyin ve kanca kalitesini artırın.";

    const report: WeeklyLearningReport = {
      success: true,
      dateRange: {
        label: resolvedRange.label,
        from: resolvedRange.from.toISOString(),
        to: resolvedRange.to.toISOString()
      },
      summary: {
        totalFeedbackEvents: feedbackEvents.length,
        totalTrainingExamples: trainingExamples.length,
        totalPatterns,
        totalQueueItems: rawQueueItems.length,
        averagePublishScore,
        averageRiskScore,
        strongestAccount,
        weakestAccount,
        topRecommendation
      },
      accounts: summaries,
      topPatterns,
      weakPatterns,
      feedbackInsights,
      queueInsight,
      nextWeekActions,
      warnings: [],
      platformSections: buildPlatformSections(feedbackEvents, trainingExamples, rawPatterns)
    };

    // AI dynamic summary hook
    const aiSummary = await generateLearningSummaryWithAI(report);
    report.aiSummary = aiSummary;

    return report;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error compile learning report.";
    throw new Error(msg);
  }
}
