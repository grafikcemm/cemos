/**
 * Instagram Yorumlar servis katmanı (Faz D).
 *  - sync: deadline'lı; media+yorum çek (LLM'siz) → yeni yorumları sınıflandır (cron stage + manuel)
 *  - analyzeNewComments: 10'arlı batch classify; bozuk batch → yorumlar 'new' kalır
 *  - generateReplyDrafts: on-demand tek/bulk; eleştiri risk-lens; çift-dilli varyantlar
 *  - recordFeedback: durum → FeedbackEvent (+sent → PublishLog) + TrainingExample, platform:"instagram"
 *
 * Manuel-publish: hiçbir yere yazma çağrısı yok. Fail-open; cron asla patlamaz.
 */

import { prisma } from "@/lib/db/client";
import { feedbackEventRepo } from "@/lib/db/feedbackEventRepo";
import { publishLogRepo } from "@/lib/db/publishLogRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { igMediaRepo } from "@/lib/db/igMediaRepo";
import { igCommentRepo } from "@/lib/db/igCommentRepo";
import { igReplyDraftRepo } from "@/lib/db/igReplyDraftRepo";
import { igConversationRepo } from "@/lib/db/igConversationRepo";
import { igMessageRepo } from "@/lib/db/igMessageRepo";
import { igDmDraftRepo } from "@/lib/db/igDmDraftRepo";
import { igInsightSnapshotRepo } from "@/lib/db/igInsightSnapshotRepo";
import {
  isConfigured,
  getRecentMedia,
  getComments,
  getConversations,
  getConversationMessages,
  getAccountInsights,
  getFollowerCount,
  getMediaInsights,
} from "@/lib/instagram/igClient";
import {
  classifyBatch,
  generateReplyVariants,
  scoreReplyRisk,
  type ClassifyInputComment,
} from "@/lib/instagram/comment-pipeline";
import {
  translateInbound,
  updateRollingSummary,
  generateDmVariants,
  scoreDmRisk,
  type DmContextMessage,
} from "@/lib/instagram/dm-pipeline";
import {
  parseAccountInsights,
  parseMediaInsights,
  topMediaByReach,
  groupMediaBySeries,
  type SeriesConfigEntry,
} from "@/lib/instagram/insight-pipeline";
import {
  IG_CLASSIFY_BATCH_SIZE,
  IG_MEDIA_FETCH_LIMIT,
  IG_BULK_DRAFT_MIN_PRIORITY,
  IG_DM_SYNC_DEADLINE_MS,
  IG_INSIGHT_SYNC_DEADLINE_MS,
  IG_DM_TRANSLATE_BATCH_SIZE,
  IG_DM_SUMMARY_THRESHOLD,
  IG_DM_CONTEXT_MESSAGES,
  IG_CONVERSATION_FETCH_LIMIT,
  IG_MESSAGES_PER_CONVERSATION,
  IG_DM_RISK_WARN_THRESHOLD,
  getIgMonthlyBudgetUsd,
  getIgUserId,
  istanbulDateKey,
} from "@/lib/instagram/igConfig";
import { usageService } from "@/lib/services/usageService";
import { BudgetExceededError } from "@/lib/config/costGate";
import igSeriesRaw from "@/data/ig-series.json";
import type { IgComment, IgReplyDraft, IgDmDraft } from "@/generated/prisma/client";
import { redactError } from "@/lib/utils/redactSecrets";

const RISK_WARN_THRESHOLD = 40; // safety < 40 → "dikkat" bandı
const IG_SERIES = igSeriesRaw as SeriesConfigEntry[];

function errMsg(e: unknown): string {
  return redactError(e);
}

/** IG attribution hesabı (mevcut @grafikcem reuse — youtubeService deseni). */
async function resolveInstagramAccountId(): Promise<string | null> {
  const acc = await prisma.account.findUnique({ where: { handle: "grafikcem" } });
  return acc?.id ?? null;
}

/** ig_ purpose'larının aylık toplamı tavanı aşarsa LLM'i durdur (sync LLM'siz devam eder). */
async function assertIgBudget(): Promise<void> {
  const spent = await usageService.getMonthlySpendByPurpose("ig_");
  const limit = getIgMonthlyBudgetUsd();
  if (spent >= limit) throw new BudgetExceededError(spent, limit);
}

function parseTs(ts?: string): Date | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export type IgSyncResult = {
  configured: boolean;
  mediaSynced: number;
  commentsUpserted: number;
  classified: number;
  skippedForDeadline: number;
  errors: number;
  // Faz E — DM + insight iç-stage sayaçları (additive).
  dmConversations: number;
  dmMessages: number;
  dmTranslated: number;
  insightCaptured: boolean;
  /** Media fetch Meta hatası (token expired/permission vb.) — UI'de yüzeye çıkar. */
  mediaError?: string;
  /** DM (conversations) Meta hatası — page token/izin/timeout. */
  dmError?: string;
};

export type IgAnalyzeResult = { classified: number; errors: number };

export type IgDraftResult = {
  generated: number;
  results: Array<{ commentId: string; drafts: IgReplyDraft[]; riskWarning: boolean }>;
};

function emptySyncResult(configured: boolean, errors = 0): IgSyncResult {
  return {
    configured,
    mediaSynced: 0,
    commentsUpserted: 0,
    classified: 0,
    skippedForDeadline: 0,
    errors,
    dmConversations: 0,
    dmMessages: 0,
    dmTranslated: 0,
    insightCaptured: false,
  };
}

/**
 * Cron stage + manuel /sync tek girişi. Sıra: media+yorum çek (LLM'siz) → yorum
 * classify → DM (15s) → insight snapshot (5s, günde 1). DM+insight için süre rezerve
 * edilir (yorumlar tüm deadline'ı yutmasın). Her iç-stage fail-open; cron asla patlamaz.
 */
async function sync(opts: { deadlineMs: number }): Promise<IgSyncResult> {
  if (!(await isConfigured())) return emptySyncResult(false);

  const stop = Date.now() + opts.deadlineMs;
  // DM + insight için süre rezerve et; yorum stage'i bu rezervi yiyemez. Rezerv en
  // fazla deadline'ın yarısı — kısa deadline'da yorumlar yine de işlenir.
  const reserveMs = Math.min(
    IG_DM_SYNC_DEADLINE_MS + IG_INSIGHT_SYNC_DEADLINE_MS,
    Math.floor(opts.deadlineMs / 2)
  );
  const commentStop = Date.now() + (opts.deadlineMs - reserveMs);

  let mediaSynced = 0;
  let commentsUpserted = 0;
  let skippedForDeadline = 0;
  let errors = 0;

  const media = await getRecentMedia(IG_MEDIA_FETCH_LIMIT);
  if (!media.ok) return { ...emptySyncResult(true, 1), mediaError: media.error };

  for (const m of media.data ?? []) {
    if (Date.now() >= commentStop) {
      skippedForDeadline++;
      continue;
    }
    try {
      await igMediaRepo.upsertByMediaId({
        mediaId: m.id,
        caption: m.caption ?? "",
        mediaType: m.media_type ?? "",
        permalink: m.permalink ?? "",
        postedAt: parseTs(m.timestamp),
        likeCount: typeof m.like_count === "number" ? m.like_count : 0,
        commentCount: typeof m.comments_count === "number" ? m.comments_count : 0,
        lastSyncedAt: new Date(),
      });
      mediaSynced++;

      const comments = await getComments(m.id);
      if (!comments.ok) {
        errors++;
        continue;
      }
      for (const c of comments.data ?? []) {
        if (!c.id) continue;
        try {
          await igCommentRepo.upsertByCommentId({
            commentId: c.id,
            mediaId: m.id,
            parentCommentId: c.parent_id ?? null,
            username: c.username ?? "",
            text: c.text ?? "",
            postedAt: parseTs(c.timestamp),
          });
          commentsUpserted++;
        } catch {
          errors++;
        }
      }
    } catch (e) {
      errors++;
      console.error("IG media sync hatası:", errMsg(e));
    }
  }

  let classified = 0;
  if (Date.now() < commentStop) {
    try {
      const res = await analyzeNewComments({ deadlineMs: commentStop - Date.now() });
      classified = res.classified;
      errors += res.errors;
    } catch (e) {
      errors++;
      console.error("IG classify hatası:", errMsg(e));
    }
  }

  // ── Faz E: DM iç-stage (≤15s) ──
  let dmConversations = 0;
  let dmMessages = 0;
  let dmTranslated = 0;
  let dmError: string | undefined;
  if (Date.now() < stop) {
    const dmDeadline = Math.min(IG_DM_SYNC_DEADLINE_MS, stop - Date.now());
    if (dmDeadline > 0) {
      try {
        const dm = await syncDms({ deadlineMs: dmDeadline });
        dmConversations = dm.conversations;
        dmMessages = dm.messages;
        dmTranslated = dm.translated;
        dmError = dm.dmError;
        errors += dm.errors;
      } catch (e) {
        errors++;
        console.error("IG DM sync hatası:", errMsg(e));
      }
    }
  }

  // ── Faz E: insight snapshot iç-stage (≤5s, günde 1) ──
  let insightCaptured = false;
  if (Date.now() < stop) {
    const insDeadline = Math.min(IG_INSIGHT_SYNC_DEADLINE_MS, stop - Date.now());
    if (insDeadline > 0) {
      try {
        const ins = await syncInsights({ deadlineMs: insDeadline });
        insightCaptured = ins.captured;
      } catch (e) {
        errors++;
        console.error("IG insight sync hatası:", errMsg(e));
      }
    }
  }

  return {
    configured: true,
    mediaSynced,
    commentsUpserted,
    classified,
    skippedForDeadline,
    errors,
    dmConversations,
    dmMessages,
    dmTranslated,
    insightCaptured,
    dmError,
  };
}

/** Yeni yorumları 10'arlı batch sınıflandır. Bozuk batch → o yorumlar 'new' kalır. */
async function analyzeNewComments(opts?: {
  deadlineMs?: number;
  limit?: number;
}): Promise<IgAnalyzeResult> {
  // Bütçe aşılmışsa hiç LLM çağırma (sync ham yorumları çekmeye devam etmişti).
  try {
    await assertIgBudget();
  } catch {
    return { classified: 0, errors: 0 };
  }
  const stop = opts?.deadlineMs ? Date.now() + opts.deadlineMs : Number.POSITIVE_INFINITY;
  const newComments = await igCommentRepo.listNew(opts?.limit ?? 200);
  const captionCache = new Map<string, string>();
  let classified = 0;
  let errors = 0;

  for (let i = 0; i < newComments.length; i += IG_CLASSIFY_BATCH_SIZE) {
    if (Date.now() >= stop) break;
    const slice = newComments.slice(i, i + IG_CLASSIFY_BATCH_SIZE);
    const mediaId = slice[0]?.mediaId ?? "";
    let caption = captionCache.get(mediaId);
    if (caption === undefined) {
      const media = mediaId ? await igMediaRepo.getByMediaId(mediaId) : null;
      caption = media?.caption ?? "";
      captionCache.set(mediaId, caption);
    }
    const input: ClassifyInputComment[] = slice.map((c) => ({
      commentId: c.commentId,
      text: c.text,
      username: c.username,
    }));
    try {
      const results = await classifyBatch(caption, input, { mediaId });
      for (const res of results) {
        await igCommentRepo.updateAnalysis(res.commentId, {
          trText: res.trText,
          lang: res.lang,
          intent: res.intent,
          intentConfidence: res.intentConfidence,
          sentiment: res.sentiment,
          priority: res.priority,
          status: "analyzed",
          analysisJson: JSON.stringify(res),
        });
        classified++;
      }
    } catch (e) {
      errors++;
      console.error("IG classify batch hatası:", errMsg(e));
      // bu batch yorumları 'new' kalır → sonraki turda yeniden denenir
    }
  }
  return { classified, errors };
}

/** On-demand tek yorum ya da toplu (priority≥60) yanıt taslağı üret. */
async function generateReplyDrafts(
  arg: { commentId: string } | { bulk: true }
): Promise<IgDraftResult> {
  await assertIgBudget();
  const bulk = "bulk" in arg;
  let comments: IgComment[];
  if (bulk) {
    comments = await igCommentRepo.listForBulkDrafts(IG_BULK_DRAFT_MIN_PRIORITY, 30);
  } else {
    const c = await igCommentRepo.getByCommentId(arg.commentId);
    comments = c ? [c] : [];
  }

  const results: IgDraftResult["results"] = [];
  for (const comment of comments) {
    try {
      const media = await igMediaRepo.getByMediaId(comment.mediaId);
      const variants = await generateReplyVariants({
        caption: media?.caption ?? "",
        commentText: comment.text,
        trText: comment.trText || comment.text,
        lang: comment.lang || "tr",
        intent: comment.intent || "diğer",
        commentId: comment.commentId,
      });
      if (variants.length === 0) continue;

      // eleştiri → tek risk-lens; safety<40 → dikkat bandı
      let riskWarning = false;
      if (comment.intent === "eleştiri") {
        const { safety } = await scoreReplyRisk(variants[0].textTr);
        riskWarning = safety < RISK_WARN_THRESHOLD;
      }

      await igReplyDraftRepo.deleteByComment(comment.commentId); // tek aktif set
      const drafts: IgReplyDraft[] = [];
      for (let v = 0; v < variants.length; v++) {
        drafts.push(
          await igReplyDraftRepo.create({
            commentId: comment.commentId,
            variant: v,
            textTr: variants[v].textTr,
            textOriginal: variants[v].textOriginal,
            tone: variants[v].tone,
            riskWarning,
          })
        );
      }
      await igCommentRepo.setStatus(comment.commentId, "drafted");
      results.push({ commentId: comment.commentId, drafts, riskWarning });
    } catch (e) {
      console.error("IG taslak üretim hatası:", errMsg(e));
      if (!bulk) throw e; // tek yorumda hatayı route'a ilet; bulk'ta diğerleri devam
    }
  }
  return { generated: results.length, results };
}

/**
 * Taslak feedback'i → IgReplyDraft güncelle + FeedbackEvent (+sent → PublishLog) +
 * TrainingExample(inputType:"ig_reply"). youtubeService.recordFeedback aynası,
 * platform:"instagram". sent → yorum 'replied'.
 */
async function recordFeedback(
  draftId: string,
  action: "sent" | "edited" | "dismissed",
  extra?: { editedText?: string; reason?: string }
): Promise<IgReplyDraft> {
  const draft = await igReplyDraftRepo.getById(draftId);
  if (!draft) throw new Error("draft_not_found");

  const updated = await igReplyDraftRepo.update(draftId, {
    status: action,
    editedText: extra?.editedText,
    sentAt: action === "sent" ? new Date() : undefined,
  });

  const accountId = await resolveInstagramAccountId();
  if (accountId) {
    const feedbackType =
      action === "sent" ? "approved" : action === "edited" ? "edited" : "rejected";
    const finalText = extra?.editedText || draft.textTr;
    const comment = await igCommentRepo.getByCommentId(draft.commentId);

    await feedbackEventRepo.create({
      accountId,
      feedbackType,
      platform: "instagram",
      originalContent: draft.textTr,
      editedContent: extra?.editedText ?? "",
      reason: extra?.reason ?? "",
    });
    if (action === "sent") {
      await publishLogRepo.create({
        accountId,
        content: finalText,
        platform: "instagram",
        success: true,
      });
      await igCommentRepo.setStatus(draft.commentId, "replied");
    }
    if (action === "sent" || action === "edited") {
      await trainingExampleRepo.create({
        accountId,
        inputType: "ig_reply",
        sourceContent: comment?.text ?? "",
        outputContent: finalText,
        label: action === "edited" ? "edited" : "good",
        reason: extra?.reason ?? "",
      });
    }
  }
  return updated;
}

// ── Faz E: DM ─────────────────────────────────────────────────────────────────

export type IgDmSyncResult = {
  conversations: number;
  messages: number;
  translated: number;
  errors: number;
  /** Konuşma çekme Meta hatası (page token/izin/timeout) — UI'de yüzeye çıkar. */
  dmError?: string;
};

/** Mesajın bizden olup olmadığı: from.id == ig-user-id VEYA username == grafikcem. */
function isFromMe(from?: { id?: string; username?: string }): boolean {
  const igUserId = getIgUserId();
  if (from?.id && igUserId && from.id === igUserId) return true;
  return (from?.username ?? "").toLowerCase() === "grafikcem";
}

/**
 * DM konuşmalarını + mesajlarını çek (LLM'siz upsert) → kalan sürede yeni gelen
 * mesajları 10'arlı çevir (bütçe-korumalı). Fail-open; cron asla patlamaz.
 */
async function syncDms(opts: { deadlineMs: number }): Promise<IgDmSyncResult> {
  const stop = Date.now() + opts.deadlineMs;
  let conversations = 0;
  let messages = 0;
  let translated = 0;
  let errors = 0;

  const convs = await getConversations(IG_CONVERSATION_FETCH_LIMIT);
  if (!convs.ok) return { conversations: 0, messages: 0, translated: 0, errors: 1, dmError: convs.error };

  for (const c of convs.data ?? []) {
    if (Date.now() >= stop) break;
    if (!c.id) continue;
    try {
      const participant = (c.participants?.data ?? []).find((p) => !isFromMe(p));
      await igConversationRepo.upsertByConversationId({
        conversationId: c.id,
        participantId: participant?.id ?? "",
        participantUsername: participant?.username ?? participant?.name ?? "",
        lastMessageAt: parseTs(c.updated_time),
      });
      conversations++;

      const msgs = await getConversationMessages(c.id, IG_MESSAGES_PER_CONVERSATION);
      if (!msgs.ok) {
        errors++;
        continue;
      }
      for (const m of msgs.data ?? []) {
        if (!m.id) continue;
        try {
          await igMessageRepo.upsertByMessageId({
            messageId: m.id,
            conversationId: c.id,
            fromMe: isFromMe(m.from),
            text: m.message ?? "",
            sentAt: parseTs(m.created_time),
          });
          messages++;
        } catch {
          errors++;
        }
      }
    } catch (e) {
      errors++;
      console.error("IG DM konuşma hatası:", errMsg(e));
    }
  }

  // Yeni gelen mesajları çevir (bütçe aşılmışsa hiç LLM çağırma — ham mesaj zaten DB'de).
  if (Date.now() < stop) {
    try {
      await assertIgBudget();
      const newMsgs = await igMessageRepo.listNewInbound(200);
      for (let i = 0; i < newMsgs.length; i += IG_DM_TRANSLATE_BATCH_SIZE) {
        if (Date.now() >= stop) break;
        const slice = newMsgs.slice(i, i + IG_DM_TRANSLATE_BATCH_SIZE);
        try {
          const res = await translateInbound(
            slice.map((m) => ({ messageId: m.messageId, text: m.text }))
          );
          for (const t of res) {
            await igMessageRepo.updateTranslation(t.messageId, { trText: t.trText, lang: t.lang });
            translated++;
          }
        } catch (e) {
          errors++;
          console.error("IG DM çeviri batch hatası:", errMsg(e));
        }
      }
    } catch {
      // bütçe aşıldı → çeviriyi atla (ham mesajlar yine de okunabilir)
    }
  }

  return { conversations, messages, translated, errors };
}

export type IgDmDraftResult = { drafts: IgDmDraft[]; riskWarning: boolean };

/**
 * On-demand bağlam-farkında DM taslağı. Konuşma uzunsa (>eşik) rollingSummary tazele;
 * son N mesaj + özet ile 2 varyant üret; DM hassas → taslaktan ÖNCE risk skoru.
 */
async function generateDmDrafts(arg: { conversationId: string }): Promise<IgDmDraftResult> {
  await assertIgBudget();
  const conv = await igConversationRepo.getByConversationId(arg.conversationId);
  if (!conv) throw new Error("conversation_not_found");

  const allMsgs = await igMessageRepo.listByConversation(arg.conversationId, 50);
  if (allMsgs.length === 0) return { drafts: [], riskWarning: false };

  // Uzun konuşma → rollingSummary tazele (bağlamı sınırlı tut).
  let summary = conv.rollingSummary;
  if (allMsgs.length > IG_DM_SUMMARY_THRESHOLD) {
    try {
      const ctxAll: DmContextMessage[] = allMsgs.map((m) => ({
        fromMe: m.fromMe,
        text: m.text,
        trText: m.trText,
      }));
      summary = await updateRollingSummary(conv.rollingSummary, ctxAll);
      await igConversationRepo.setRollingSummary(arg.conversationId, summary);
    } catch (e) {
      console.error("IG rolling summary hatası:", errMsg(e));
    }
  }

  const recent: DmContextMessage[] = allMsgs
    .slice(-IG_DM_CONTEXT_MESSAGES)
    .map((m) => ({ fromMe: m.fromMe, text: m.text, trText: m.trText }));
  const lastInbound = [...allMsgs].reverse().find((m) => !m.fromMe);
  const lang = lastInbound?.lang || "tr";

  const variants = await generateDmVariants({
    rollingSummary: summary,
    recentMessages: recent,
    lang,
    conversationId: arg.conversationId,
  });
  if (variants.length === 0) return { drafts: [], riskWarning: false };

  // DM hassas → ilk varyantı her zaman risk skorla.
  const { safety } = await scoreDmRisk(variants[0].textTr);
  const riskWarning = safety < IG_DM_RISK_WARN_THRESHOLD;

  await igDmDraftRepo.deleteByConversation(arg.conversationId); // tek aktif set
  const drafts: IgDmDraft[] = [];
  for (let v = 0; v < variants.length; v++) {
    drafts.push(
      await igDmDraftRepo.create({
        conversationId: arg.conversationId,
        messageId: lastInbound?.messageId ?? null,
        variant: v,
        textTr: variants[v].textTr,
        textOriginal: variants[v].textOriginal,
        tone: variants[v].tone,
        riskWarning,
      })
    );
  }
  return { drafts, riskWarning };
}

/**
 * DM taslak feedback'i → IgDmDraft güncelle + FeedbackEvent (+sent → PublishLog) +
 * TrainingExample(inputType:"ig_dm"), platform:"instagram". recordFeedback aynası.
 */
async function recordDmFeedback(
  draftId: string,
  action: "sent" | "edited" | "dismissed",
  extra?: { editedText?: string; reason?: string }
): Promise<IgDmDraft> {
  const draft = await igDmDraftRepo.getById(draftId);
  if (!draft) throw new Error("draft_not_found");

  const updated = await igDmDraftRepo.update(draftId, {
    status: action,
    editedText: extra?.editedText,
    sentAt: action === "sent" ? new Date() : undefined,
  });

  const accountId = await resolveInstagramAccountId();
  if (accountId) {
    const feedbackType =
      action === "sent" ? "approved" : action === "edited" ? "edited" : "rejected";
    const finalText = extra?.editedText || draft.textTr;
    const sourceMsg = draft.messageId
      ? await prisma.igMessage.findUnique({ where: { messageId: draft.messageId } })
      : null;

    await feedbackEventRepo.create({
      accountId,
      feedbackType,
      platform: "instagram",
      originalContent: draft.textTr,
      editedContent: extra?.editedText ?? "",
      reason: extra?.reason ?? "",
    });
    if (action === "sent") {
      await publishLogRepo.create({
        accountId,
        content: finalText,
        platform: "instagram",
        success: true,
      });
    }
    if (action === "sent" || action === "edited") {
      await trainingExampleRepo.create({
        accountId,
        inputType: "ig_dm",
        sourceContent: sourceMsg?.trText || sourceMsg?.text || "",
        outputContent: finalText,
        label: action === "edited" ? "edited" : "good",
        reason: extra?.reason ?? "",
      });
    }
  }
  return updated;
}

// ── Faz E: İstatistik snapshot ──────────────────────────────────────────────────

export type IgInsightSyncResult = { captured: boolean };

/**
 * Günde-1 hesap + medya insight snapshot'ı. date @unique idempotent: bugünün İstanbul
 * date'i için satır varsa erken çık. LLM YOK → bütçe-gate yok. Her çağrı fail-open;
 * kısmi veri OK (hepsi başarısızsa boş satır YAZMA → not_configured durumunu koru).
 */
async function syncInsights(opts: { deadlineMs: number }): Promise<IgInsightSyncResult> {
  const key = istanbulDateKey();
  const existing = await igInsightSnapshotRepo.getByDate(key);
  if (existing) return { captured: false };

  const account = await getAccountInsights();
  const follower = await getFollowerCount();
  const mediaIns = await getMediaInsights(12);

  // Hiçbiri gelmediyse (Meta unset / page kopuk) → boş satır yazma.
  if (!account.ok && !follower.ok && !mediaIns.ok) return { captured: false };

  const metrics = account.ok ? parseAccountInsights(account.data) : null;
  const followerCount = follower.ok && typeof follower.data === "number" ? follower.data : 0;
  const mediaItems = mediaIns.ok ? parseMediaInsights(mediaIns.data) : [];
  const top = topMediaByReach(mediaItems, 8);
  const series = groupMediaBySeries(mediaItems, IG_SERIES);

  await igInsightSnapshotRepo.upsertByDate(key, {
    followerCount,
    reach: metrics?.reach ?? 0,
    views: metrics?.views ?? 0,
    accountsEngaged: metrics?.accountsEngaged ?? 0,
    likes: metrics?.likes ?? 0,
    comments: metrics?.comments ?? 0,
    saves: metrics?.saves ?? 0,
    shares: metrics?.shares ?? 0,
    topMediaJson: JSON.stringify(top),
    seriesJson: JSON.stringify(series),
    rawJson: JSON.stringify({ account: account.data ?? null, media: mediaIns.data ?? null }),
  });
  return { captured: true };
}

export const instagramService = {
  sync,
  analyzeNewComments,
  generateReplyDrafts,
  recordFeedback,
  syncDms,
  generateDmDrafts,
  recordDmFeedback,
  syncInsights,
};
