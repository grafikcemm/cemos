"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import OperatorReadinessGate from "../gate/OperatorReadinessGate";
import MorningHeroStats from "../morning/MorningHeroStats";
import OpportunityHandoffBand from "../morning/OpportunityHandoffBand";
import ReviewQueue from "../morning/ReviewQueue";
import DigestSection from "../morning/DigestSection";
import NewsHighlights from "../morning/NewsHighlights";
import RepoHighlights from "../morning/RepoHighlights";
import YouTubeHighlights from "../morning/YouTubeHighlights";
import { useDailyQueueData } from "../morning/useDailyQueueData";
import { useToast } from "../ui/Toast";

/**
 * Bugün yüzeyi (FIRST-SPRINT items 1-5) — sıra: aksiyon > sinyal > arşiv.
 *  1. Tek satır sayaç (+ ● sağlık tiki)
 *  2. ReadinessGate — yalnız SORUN varken görünür
 *  3. ReviewQueue FOLD ÜSTÜ (NEXT UP + inline edit + Bugünlük bitti ✓)
 *  4. "Tepki vermeye değer" — varsayılan KATLANMIŞ
 *  5. Digest — katlanabilir arşiv
 * Kuyruk verisi burada BİR KEZ yüklenir; sayaç + kuyruk paylaşır.
 */
export default function MorningDashboardTab() {
  const toast = useToast();
  const queue = useDailyQueueData();
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  // Fırsattan üretilen taslak kuyruğa gelince odak ona taşınır (ADR-028).
  const [focusSeed, setFocusSeed] = useState<string | null>(null);

  const handleGenerated = useCallback(
    async (queueItemId: string) => {
      await queue.fetchDrafts();
      setFocusSeed(queueItemId);
    },
    [queue],
  );

  const showToast = useCallback(
    (text: string, type: "success" | "error") => {
      if (type === "success") toast.success(text);
      else toast.error(text);
    },
    [toast],
  );

  return (
    <div style={{ width: "100%" }}>
      {/* Başlık YOK — breadcrumb yeter; aktif taslak ilk viewport'ta başlar. */}
      <MorningHeroStats queue={queue} />

      <OperatorReadinessGate />

      <OpportunityHandoffBand onGenerated={handleGenerated} />

      <ReviewQueue onToast={showToast} queue={queue} focusSeed={focusSeed} />

      {/* "Tepki vermeye değer" — fold altı, varsayılan katlanmış (item 3). */}
      <section style={{ marginTop: "var(--space-6)" }}>
        <button
          type="button"
          onClick={() => setHighlightsOpen((v) => !v)}
          aria-expanded={highlightsOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 14px",
            color: "var(--text-primary)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "inherit",
          }}
        >
          {highlightsOpen ? (
            <ChevronDown size={16} strokeWidth={2} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
          ) : (
            <ChevronRight size={16} strokeWidth={2} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
          )}
          Tepki vermeye değer
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", fontWeight: 500 }}>
            · haber / repo / YouTube sinyalleri
          </span>
        </button>

        {highlightsOpen && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
              gap: "var(--space-5)",
              alignItems: "start",
              marginTop: "var(--space-4)",
            }}
          >
            <YouTubeHighlights />
            <NewsHighlights onToast={showToast} />
            <RepoHighlights onToast={showToast} />
          </div>
        )}
      </section>

      <div style={{ marginTop: "var(--space-5)" }}>
        <DigestSection />
      </div>
    </div>
  );
}
