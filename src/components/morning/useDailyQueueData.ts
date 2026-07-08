"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchJson } from "@/lib/utils/safeFetch";

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
};

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
};

type DailyQueueResponse = {
  success: boolean;
  error?: string;
  items?: MorningDraft[];
};

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
          prev.map((d) => (d.id === id ? { ...d, editedContent: content } : d))
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

  return { drafts, loading, error, fetchDrafts, saveDraft, markPublished };
}
