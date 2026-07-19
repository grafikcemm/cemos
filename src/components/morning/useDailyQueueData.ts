"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { assessReadiness, type ReadinessInput, type ReadinessResult } from "@/lib/services/readinessService";
import { isThreadDraft, joinThreadSegments, parseThreadSegments } from "@/lib/growth-engine/threadSegments";
import type { WhyTodayResult } from "@/lib/services/whyToday";

/** Sprint 1 ayrışık alt-sinyaller — API scoresParsed'tan (tek sayı YOK). */
export type MorningDraftScores = {
  hookStrengthScore: number;
  noveltyScore: number;
  riskScore: number;
  personaMatchScore: number;
  clarityScore: number;
  /** null = sinyal yok (judge koşmadı / eski kayıt) — UI uydurma göstermez. */
  turkishNaturalness: number | null;
  sourceFaithfulness: number | null;
  judged: boolean;
  leaks: { kind: string; severity: string; note: string }[];
  leakCount: number;
  reasoning?: string;
  angle?: string;
  patternUsed?: string | null;
  writerModel?: string;
  judgeModel?: string;
  finalEditorModel?: string;
};

/** Drawer kaynak bloğu — scannedAt "tarandı" (fact-check DEĞİL). */
export type MorningSourcePost = { url: string; scannedAt: string; publishedAt: string | null } | null;
export type MorningNewsItem = {
  trTitle: string | null;
  originalTitle: string;
  whyPeopleCare: string | null;
  url: string;
  sourceVerification: string | null;
} | null;

/** Faz 1E (ADR-025): server kaynaklı intent hazırlık durumu — reload'a dayanır. */
export type MorningPublishAttempt = {
  id: string;
  state: string; // "prepared" | "succeeded" | "failed"
  contentHash: string;
  /** İçerik hazırlıktan sonra değişti — eski hazırlık stale, yeniden "X'te aç". */
  staleForCurrentContent: boolean;
} | null;

export type MorningDraft = {
  id: string;
  accountId: string;
  content: string;
  editedContent: string | null;
  draftType: string;
  mode: string;
  status: string;
  accountHandle: string;
  displayName: string;
  createdAt: string;
  scoresParsed?: MorningDraftScores;
  /** Kalite kapısı Türkçe notları buradan okunur (quality_gate issue'ları). */
  lintReport?: string | null;
  generatedImageUrl?: string | null;
  /** Faz 1C — yayına-hazırlık (sunucu, kayıtlı metin üzerinde). */
  readiness?: ReadinessResult;
  /** Faz 1C — client canlı readiness için (editedContent'i değiştir → assessReadiness). */
  readinessInput?: ReadinessInput;
  /** Faz 1C — "Neden bugün?" + doğrulama durumu. */
  whyToday?: WhyTodayResult;
  /** Faz 1C — yapısal thread segmentleri (JSON string; yoksa null). */
  threadSegments?: string | null;
  /** Faz 1E — intent hazırlık durumu (server kaynağı; optimistic state bunun yerine geçmez). */
  publishAttempt?: MorningPublishAttempt;
  sourcePostId?: string | null;
  newsItemId?: string | null;
  sourcePost?: MorningSourcePost;
  newsItem?: MorningNewsItem;
};

type DailyQueueResponse = {
  success: boolean;
  error?: string;
  items?: MorningDraft[];
};

/** editedContent/threadSegments değişince readiness'i client'ta YENİDEN türet
 *  (aynı saf assessReadiness → kart/kuyruk/sunucu tutarlı). */
function recompute(draft: MorningDraft, patch: Partial<ReadinessInput>): MorningDraft {
  if (!draft.readinessInput) return draft;
  const nextInput = { ...draft.readinessInput, ...patch };
  return { ...draft, readinessInput: nextInput, readiness: assessReadiness(nextInput) };
}

/**
 * Loads today's drafts grouped per account for the Morning Dashboard review
 * flow. Mirrors DailyQueueTab's fetch + save + status-change logic but trimmed
 * to the sequential-review shape the morning flow needs.
 */
export function useDailyQueueData() {
  const [drafts, setDrafts] = useState<MorningDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        accountHandle: "all",
        status: "active",
        dateRange: "today",
        risk: "all",
        search: "",
        sort: "createdAt",
      });
      const data = await fetchJson<DailyQueueResponse>(
        `/api/growth/daily-queue?${q.toString()}`
      );
      if (data.success && data.items) {
        setDrafts(data.items);
      } else {
        setError(data.error || "Taslaklar alınamadı.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sunucu hatası.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const saveDraft = useCallback(async (id: string, content: string): Promise<boolean> => {
    if (!content.trim()) return false;
    try {
      const data = await fetchJson<{ success: boolean }>(
        `/api/growth/daily-queue/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      if (data.success) {
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === id
              ? recompute(
                  {
                    ...d,
                    editedContent: content,
                    // İçerik değişti → mevcut hazırlık stale (sunucu contentHash
                    // ile zaten reddeder; UI da dürüst davranır).
                    publishAttempt: d.publishAttempt
                      ? { ...d.publishAttempt, staleForCurrentContent: true }
                      : d.publishAttempt,
                  },
                  { editedContent: content }
                )
              : d
          )
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  /** Yapısal thread segmentlerini kaydet (JSON string; null = temizle). */
  const saveSegments = useCallback(async (id: string, segmentsJson: string | null): Promise<boolean> => {
    try {
      const data = await fetchJson<{ success: boolean }>(
        `/api/growth/daily-queue/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadSegments: segmentsJson }),
        }
      );
      if (data.success) {
        setDrafts((prev) =>
          prev.map((d) => {
            if (d.id !== id) return d;
            const segs = parseThreadSegments(segmentsJson);
            // Phase 2D: server segmentlerle editedContent'i AYNI update'te
            // senkronlar — client state de aynı canonical birleşimi taşır ve
            // mevcut hazırlık stale olur (hash segmentlerden türediği için).
            const joined = segs && isThreadDraft(d.draftType, d.mode) ? joinThreadSegments(segs) : d.editedContent;
            return recompute(
              {
                ...d,
                threadSegments: segmentsJson,
                editedContent: joined ?? d.editedContent,
                publishAttempt: d.publishAttempt
                  ? { ...d.publishAttempt, staleForCurrentContent: true }
                  : d.publishAttempt,
              },
              { threadSegments: segs, editedContent: joined ?? d.editedContent }
            );
          })
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  /**
   * Faz 1E: "X'te aç" hazırlığı — server PublishAttempt(prepared) yaratır.
   * Başarıda draft'ın publishAttempt'i server yanıtından güncellenir (optimistic
   * state gerçek server state'in yerine geçmez).
   */
  const prepareIntent = useCallback(
    async (id: string): Promise<{ ok: boolean; intentUrl?: string; error?: string }> => {
      try {
        const data = await fetchJson<{
          success: boolean;
          error?: string;
          intentUrl?: string;
          attempt?: { id: string; state: string; contentHash: string };
        }>(`/api/queue/${id}/prepare-intent`, { method: "POST" });
        if (data.success && data.intentUrl && data.attempt) {
          const attempt = data.attempt;
          setDrafts((prev) =>
            prev.map((d) =>
              d.id === id
                ? {
                    ...d,
                    publishAttempt: {
                      id: attempt.id,
                      state: attempt.state,
                      contentHash: attempt.contentHash,
                      staleForCurrentContent: false,
                    },
                  }
                : d
            )
          );
          return { ok: true, intentUrl: data.intentUrl };
        }
        return { ok: false, error: data.error || "Hazırlık başarısız." };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Hazırlık başarısız." };
      }
    },
    []
  );

  const markPublished = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const data = await fetchJson<{ success: boolean; error?: string }>(
        `/api/growth/daily-queue/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "manual_published" }),
        }
      );
      if (data.success) {
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  status: "manual_published",
                  publishAttempt: d.publishAttempt ? { ...d.publishAttempt, state: "succeeded" } : d.publishAttempt,
                }
              : d
          )
        );
        return { ok: true };
      }
      return { ok: false, error: data.error || "İşaretleme başarısız." };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "İşaretleme başarısız." };
    }
  }, []);

  /**
   * Phase 5A (ADR-044): açık geri bildirim — tek servis (/feedback → processFeedback:
   * FeedbackEvent + memory sinyali + pattern reweight + TrainingExample). idempotencyKey
   * ile çift-tık/retry çoğaltmaz. Status'u optimistic yansıt (sunucu da aynı mantığı uygular).
   */
  const sendFeedback = useCallback(
    async (
      id: string,
      feedbackType: string,
      opts: { reason?: string; idempotencyKey: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/growth/daily-queue/${id}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedbackType,
            reason: opts.reason,
            idempotencyKey: opts.idempotencyKey,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
        if (res.ok && data.success) {
          setDrafts((prev) =>
            prev.map((d) => {
              if (d.id !== id) return d;
              const status =
                feedbackType === "approved" || feedbackType === "edited"
                  ? "approved"
                  : feedbackType === "rejected"
                    ? "rejected"
                    : d.status;
              return { ...d, status };
            }),
          );
          return { ok: true };
        }
        return { ok: false, error: data.error || "Geri bildirim kaydedilemedi." };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Geri bildirim kaydedilemedi." };
      }
    },
    [],
  );

  /**
   * Phase 5A (ADR-044): operatör-tetikli yeniden değerlendirme. 402 → dürüst blocked
   * (AI kredisi yok); judged=false → degraded heuristik; judged=true → taze skorlar.
   * scoresParsed'ı anında güncelle (drawer yansıtır).
   */
  const rescore = useCallback(
    async (
      id: string,
    ): Promise<{ ok: boolean; judged?: boolean; degraded?: boolean; blocked?: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/growth/daily-queue/${id}/rescore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          judged?: boolean;
          degraded?: boolean;
          critic?: Record<string, number>;
        };
        if (res.status === 402) {
          return { ok: false, blocked: true, error: data.error || "AI değerlendirme bütçesi tükendi." };
        }
        if (res.ok && data.success) {
          const judged = data.judged === true;
          const critic = (data.critic ?? {}) as Record<string, number | undefined>;
          setDrafts((prev) =>
            prev.map((d) => {
              if (d.id !== id || !d.scoresParsed) return d;
              return {
                ...d,
                scoresParsed: {
                  ...d.scoresParsed,
                  hookStrengthScore: critic.hookStrengthScore ?? d.scoresParsed.hookStrengthScore,
                  clarityScore: critic.clarityScore ?? d.scoresParsed.clarityScore,
                  noveltyScore: critic.noveltyScore ?? d.scoresParsed.noveltyScore,
                  personaMatchScore: critic.personaMatchScore ?? d.scoresParsed.personaMatchScore,
                  riskScore: critic.riskScore ?? d.scoresParsed.riskScore,
                  judged,
                  judgeModel: judged ? "ai" : "heuristic",
                },
              };
            }),
          );
          return { ok: true, judged, degraded: data.degraded === true };
        }
        return { ok: false, error: data.error || "Yeniden değerlendirme başarısız." };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Yeniden değerlendirme başarısız." };
      }
    },
    [],
  );

  return {
    drafts,
    loading,
    error,
    fetchDrafts,
    saveDraft,
    saveSegments,
    prepareIntent,
    markPublished,
    sendFeedback,
    rescore,
  };
}
