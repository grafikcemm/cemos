"use client";

import { useState } from "react";
import { Radar, Clapperboard } from "lucide-react";
import { PageHeader } from "@/components/ui";
import CompetitorRadarSection from "@/components/instagram/CompetitorRadarSection";
import ReelsDossierSection from "@/components/instagram/ReelsDossierSection";

/**
 * TEK Instagram alan ekranı (Sprint 8 — CONTENT-ENGINE §3/§4, C6 kuralı:
 * alt-sekmeler ekran İÇİNDE, top-level sekme çoğalmaz).
 *  - Rakip Radarı: watchlist (business_discovery probe'lu) + outlier feed
 *  - Reels Dosyaları: dossier listesi (doğrulanmış-araç rozeti hero) + ay planı
 */

type SubTab = "radar" | "reels";

export default function InstagramTab() {
  const [sub, setSub] = useState<SubTab>("radar");

  return (
    <div style={{ width: "100%", paddingBottom: "var(--space-12)" }}>
      <PageHeader
        eyebrow="INSTAGRAM"
        title="Instagram"
        subtitle="Policy-safe rakip istihbaratı ve üretime-hazır Reels dosyaları — tek alan."
      />

      <div
        role="tablist"
        aria-label="Instagram alt sekmeleri"
        style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-5)" }}
      >
        {(
          [
            { id: "radar" as const, label: "Rakip Radarı", icon: <Radar size={15} strokeWidth={2} /> },
            { id: "reels" as const, label: "Reels Dosyaları", icon: <Clapperboard size={15} strokeWidth={2} /> },
          ]
        ).map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setSub(t.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)", fontWeight: 500, fontFamily: "inherit",
                cursor: "pointer",
                background: active ? "var(--accent-dark)" : "var(--bg-surface)",
                color: active ? "var(--accent-text)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
                transition: "color 0.15s var(--ease-out), border-color 0.15s var(--ease-out)",
              }}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {sub === "radar" ? <CompetitorRadarSection /> : <ReelsDossierSection />}
    </div>
  );
}
