"use client";

import { useCallback } from "react";
import OperatorReadinessGate from "../gate/OperatorReadinessGate";
import MorningHeroStats from "../morning/MorningHeroStats";
import ReviewQueue from "../morning/ReviewQueue";
import DigestSection from "../morning/DigestSection";
import NewsHighlights from "../morning/NewsHighlights";
import RepoHighlights from "../morning/RepoHighlights";
import InstagramHighlights from "../morning/InstagramHighlights";
import YouTubeHighlights from "../morning/YouTubeHighlights";
import PageHeader from "../ui/PageHeader";
import SectionHeader from "../ui/SectionHeader";
import { useToast } from "../ui/Toast";

export default function MorningDashboardTab() {
  const toast = useToast();

  const showToast = useCallback(
    (text: string, type: "success" | "error") => {
      if (type === "success") toast.success(text);
      else toast.error(text);
    },
    [toast],
  );

  return (
    <div style={{ width: "100%", paddingBottom: 60 }}>
      <PageHeader
        eyebrow="GÜNLÜK OPERASYON"
        title="Bugün"
        subtitle="Sıralı inceleme akışı — incele, düzenle, kopyala, paylaş. Yaklaşık 5 dakika."
        surface
      />

      <MorningHeroStats />

      <OperatorReadinessGate />

      <ReviewQueue onToast={showToast} />
      <DigestSection />

      {/* Highlights — editöryal bento (eşit-grid değil) */}
      <div style={{ marginTop: "var(--space-8)" }}>
        <SectionHeader
          eyebrow="GÜNÜN NABZI"
          title="Öne çıkanlar"
          description="Sosyal kanallar, haber havuzu ve repo radarından bugüne dair sinyaller."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "var(--space-5)",
            alignItems: "start",
            marginTop: "var(--space-5)",
          }}
        >
          <InstagramHighlights />
          <YouTubeHighlights />
          <NewsHighlights onToast={showToast} />
          <RepoHighlights onToast={showToast} />
        </div>
      </div>
    </div>
  );
}
