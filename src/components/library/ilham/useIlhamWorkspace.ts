"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveAccount } from "@/lib/accounts/useActiveAccount";

/**
 * Kütüphane→İlham veri kaynağı (Phase 3C §E). Tek GET /api/inspiration ile
 * çalışma alanının tamamı: panolar, kayıtlar, watchlist özeti, outlier feed,
 * AI kapısının dürüst durumu.
 *
 * WP-04 / P0-2 batch A2: bu ekranın KENDİ `useState("")` accountId seçicisi
 * (accounts[0] fallback'iyle) sidebar switcher'ından bağımsızdı — sidebar
 * başka hesaptayken İlham eski hesapta kalabilirdi. Artık TEK otorite:
 * global activeChannel (useActiveAccount, FAIL-CLOSED). IlhamHeaderBar'daki
 * Select ID-değerli kalır (mevcut davranış, daha küçük diff) — switchAccount
 * id→handle çevirip setChannel çağırır; Select böylece global switcher'ın
 * iki-yönlü görünümüdür.
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
  const {
    setChannel,
    accountId, // string | null — FAIL-CLOSED (bkz. src/lib/accounts/activeAccount.ts)
    channelUnknown,
    accounts,
    accountsLoading,
    accountsFailed,
    reloadAccounts,
  } = useActiveAccount();
  const [boardId, setBoardId] = useState("");
  const [workspace, setWorkspace] = useState<IlhamWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Hesap HANGİ kaynaktan değişirse değişsin (bu ekranın Select'i ya da
  // sidebar switcher) önceki hesabın pano seçimi taşınmaz.
  useEffect(() => {
    setBoardId("");
  }, [accountId]);

  const reload = useCallback(async () => {
    if (!accountId) {
      // FAIL-CLOSED: channel'ın hesap karşılığı yok (accounts boş/uyumsuz) —
      // account-scoped fetch YOK. loading kapatılır ki sonsuz skeleton'a
      // düşülmesin; tüketici workspace===null + accounts durumlarını kullanır.
      setLoading(false);
      return;
    }
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

  const switchAccount = useCallback(
    (id: string) => {
      // IlhamHeaderBar'ın Select'i ID-değerli (accounts[].id); global
      // switcher handle bekliyor — burada çevrilir (two-way bind).
      const target = accounts.find((a) => a.id === id);
      if (target) setChannel(target.handle);
    },
    [accounts, setChannel],
  );

  return {
    accounts,
    accountsLoading,
    accountsFailed,
    reloadAccounts,
    // Tüketiciler (IlhamHeaderBar/CaptureDrawer/InspirationDetailDrawer) prop
    // tipini `string` bekliyor; null iken "" sentinel'i onlarda da mevcut
    // `if (!accountId)` falsy-gate'leriyle fetch/POST'u aynı şekilde durdurur
    // — bu batch dışındaki dosyaların tipini değiştirmeden fail-closed korunur.
    accountId: accountId ?? "",
    // Review PR#9 HIGH-1: channel listede yok (bayat persist edilmiş handle) →
    // tüketici ErrorState basar; sessiz blank/return-null YASAK.
    channelUnknown,
    switchAccount,
    boardId,
    setBoardId,
    workspace,
    loading,
    failed,
    reload,
  };
}
