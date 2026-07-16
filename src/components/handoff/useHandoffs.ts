"use client";

import { useCallback, useEffect, useState } from "react";
import type { Opportunity } from "@/lib/services/opportunityCuration";

/**
 * OpportunityHandoff client katmanı (ADR-028). Handoff'lar SERVER-persisted —
 * Zustand/localStorage'a KONMAZ; her yüzey mount'ta bekleyenleri buradan
 * yükler (reload sonrası kaybolmaz).
 */

export type HandoffDto = {
  id: string;
  accountId: string;
  action: "generate" | "plan" | "series";
  status: "pending" | "consumed" | "cancelled";
  sourceKind: "news" | "youtube" | "radar" | "discovery";
  sourceId: string;
  sourcePlatform: string;
  title: string;
  topicSeed: string;
  whyNow: string;
  whyNowDetail: string;
  suggestedPlatform: string;
  score: number;
  curationMethod: string;
  blockedReason: string | null;
  resultQueueItemId: string | null;
  resultRef: string | null;
  createdAt: string;
};

export const HANDOFF_SOURCE_LABEL: Record<HandoffDto["sourceKind"], string> = {
  news: "Haber",
  youtube: "YouTube",
  radar: "Rakip radarı",
  discovery: "Keşif",
};

/** Fırsatlar eyleminden idempotent handoff yaratır (duplicate click güvenli). */
export async function createHandoffFromOpportunity(
  o: Opportunity,
  accountId: string,
  action: HandoffDto["action"]
): Promise<{ ok: boolean; handoffId?: string; reused?: boolean; error?: string }> {
  try {
    const res = await fetch("/api/opportunities/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        action,
        sourceKind: o.source,
        sourceId: o.id,
        sourcePlatform: o.sourcePlatform ?? "",
        title: o.title,
        topicSeed: o.topicSeed,
        whyNow: o.whyNow,
        whyNowDetail: o.whyNowDetail ?? "",
        rawTab: o.rawTab,
        suggestedPlatform: o.suggestedPlatform,
        score: o.score,
        curationMethod: "deterministic",
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? "Aktarım kaydedilemedi." };
    }
    return { ok: true, handoffId: json.handoff?.id, reused: json.reused };
  } catch {
    return { ok: false, error: "Aktarım kaydedilemedi (ağ hatası)." };
  }
}

export function usePendingHandoffs(action: HandoffDto["action"], accountId?: string) {
  const [handoffs, setHandoffs] = useState<HandoffDto[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ action, status: "pending" });
      if (accountId) qs.set("accountId", accountId);
      const res = await fetch(`/api/opportunities/handoff?${qs.toString()}`);
      const json = await res.json();
      setHandoffs(res.ok && json.success ? (json.handoffs ?? []) : []);
    } catch {
      // Bekleyen aktarım listesi yardımcı banttır — düşerse yüzeyin geri
      // kalanını bozmaz; bir sonraki reload'da tekrar denenir.
      setHandoffs([]);
    } finally {
      setLoading(false);
    }
  }, [action, accountId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const cancel = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/opportunities/handoff/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "cancel" }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) return { ok: false, error: json.error ?? "İptal edilemedi." };
        await reload();
        return { ok: true };
      } catch {
        return { ok: false, error: "İptal edilemedi (ağ hatası)." };
      }
    },
    [reload]
  );

  return { handoffs, loading, reload, cancel };
}
