"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccounts } from "@/components/plan/useAccounts";

/**
 * Kütüphane→İlham veri kaynağı (Phase 3C §E). Tek GET /api/inspiration ile
 * çalışma alanının tamamı: panolar, kayıtlar, watchlist özeti, outlier feed,
 * AI kapısının dürüst durumu. Hesap seçimi Takvim/Fırsatlar deseniyle aynı
 * (explicit Select; gizli accounts[0] varsayımı YOK — ilk hesap yalnız
 * başlangıç değeri olarak seçilir ve UI'da görünürdür).
 */

export type IlhamMeta = {
  schemaVersion: string;
  kind: string;
  format: "ig_reel" | "ig_carousel" | "ig_static" | "unknown";
  formatSource: "operator" | "url_hint" | "unknown";
  creatorHandle: string;
  caption: string;
  transcript: string;
  manualMetrics: {
    provenance: "operator_observed";
    observedAt: string;
    likes?: number;
    comments?: number;
    views?: number;
    saves?: number;
    shares?: number;
  } | null;
  capturedAt: string;
  analysis: IlhamAnalysis | null;
};

export type IlhamAnalysis = {
  analysisVersion: string;
  analyzedAt: string;
  observedFacts: string[];
  structuralHypotheses: string[];
  hookType: string;
  openingMechanism: string | null;
  contentSequence: string[];
  captionSequence: string[];
  valuePromise: { present: boolean; evidence: string | null };
  proofOrDemoState: string;
  ctaType: string;
  hashtagStructure: { count: number; placement: string; casing: string; coreTags: string[] };
  lineBreakStructure: { paragraphs: number; usesListFormat: boolean; avgLineLength: number };
  transferablePrinciples: string[];
  nonTransferableElements: string[];
  copyingRisk: { level: "low" | "medium" | "high"; reason: string };
  performanceAssessment: {
    status: string;
    workedClaimAllowed: boolean;
    statement: string;
    multiplier: number | null;
    sampleSize: number | null;
  };
  confidence: number;
  evidenceBasis: string[];
  limitations: string[];
};

export type IlhamItem = {
  id: string;
  boardId: string;
  contentItemId: string | null;
  title: string;
  url: string;
  note: string;
  itemType: string;
  createdAt: string;
  meta: IlhamMeta | null;
  content: {
    id: string;
    platform: string;
    format: string;
    author: string;
    title: string;
    body: string;
    canonicalUrl: string | null;
    sourceType: string;
    analysisStatus: string;
  } | null;
  outlier: {
    multiplier: number | null;
    insufficient: boolean;
    sampleSize: number;
    baselineMedian: number;
    computedAt: string | null;
  } | null;
};

export type IlhamWorkspace = {
  boards: Array<{ id: string; name: string; icon: string; itemCount: number }>;
  selectedBoardId: string | null;
  items: IlhamItem[];
  watch: {
    configured: boolean;
    total: number;
    ok: number;
    unavailable: number;
    configRequired: number;
    pending: number;
    neverSynced: number;
    lastSyncAt: string | null;
    stale: boolean;
  };
  outliers: Array<{
    contentItemId: string;
    author: string;
    format: string;
    caption: string;
    url: string | null;
    publishedAt: string | null;
    multiplier: number | null;
    insufficient: boolean;
    sampleSize: number;
    computedAt: string | null;
  }>;
  gate: { allowed: boolean; missing: string[] };
};

export function useIlhamWorkspace() {
  const { accounts, loading: accountsLoading, failed: accountsFailed, reload: reloadAccounts } = useAccounts();
  const [accountId, setAccountId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [workspace, setWorkspace] = useState<IlhamWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id);
  }, [accountId, accounts]);

  const reload = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ accountId });
      if (boardId) params.set("boardId", boardId);
      const res = await fetch(`/api/inspiration?${params.toString()}`);
      if (!res.ok) throw new Error("http");
      const json = await res.json();
      if (!json.success) throw new Error("payload");
      const ws: IlhamWorkspace = json.workspace;
      setWorkspace(ws);
      if (ws.selectedBoardId && ws.selectedBoardId !== boardId) setBoardId(ws.selectedBoardId);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accountId, boardId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const switchAccount = useCallback((id: string) => {
    setAccountId(id);
    setBoardId(""); // hesap değişince pano seçimi sıfırlanır (cross-account sızıntı yok)
  }, []);

  return {
    accounts,
    accountsLoading,
    accountsFailed,
    reloadAccounts,
    accountId,
    switchAccount,
    boardId,
    setBoardId,
    workspace,
    loading,
    failed,
    reload,
  };
}
