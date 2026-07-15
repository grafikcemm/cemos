"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";
import { assessReadiness, type ReadinessInput, type ReadinessResult } from "@/lib/services/readinessService";
import { parseThreadSegments } from "@/lib/growth-engine/threadSegments";
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
          prev.map((d) => (d.id === id ? recompute({ ...d, editedContent: content }, { editedContent: content }) : d))
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
          prev.map((d) =>
            d.id === id
              ? recompute({ ...d, threadSegments: segmentsJson }, { threadSegments: parseThreadSegments(segmentsJson) })
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

  const markPublished = useCallback(async (id: string): Promise<boolean> => {
    try {
      const data = await fetchJson<{ success: boolean }>(
        `/api/growth/daily-queue/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "manual_published" }),
        }
      );
      if (data.success) {
        setDrafts((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: "manual_published" } : d))
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  return { drafts, loading, error, fetchDrafts, saveDraft, saveSegments, markPublished };
}
