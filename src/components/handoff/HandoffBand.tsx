"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useXAgentStore } from "@/store/xagent";
import { HANDOFF_SOURCE_LABEL, type HandoffDto } from "./useHandoffs";

/**
 * Kompakt "Fırsattan geldi" provenance bandı (ADR-028, §13 görsel sözleşme):
 * mevcut primitive'lerle, hero/banner DEĞİL; tek birincil eylem + açık
 * vazgeç; blockedReason dürüst blocked-external satırı + Entegrasyonlar
 * kurtarma yolu. Yeni dashboard/wizard yüzeyi üretmez.
 */

type Props = {
  handoff: HandoffDto;
  /** Tek birincil eylem (yüzeye özgü). */
  primary: ReactNode;
  onCancel: () => void;
  cancelling?: boolean;
};

export default function HandoffBand({ handoff, primary, onCancel, cancelling }: Props) {
  const setActiveTab = useXAgentStore((s) => s.setActiveTab);
  return (
    <div
      data-testid={`handoff-band-${handoff.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        background: "color-mix(in srgb, var(--accent) 6%, var(--bg-surface))",
        border: "1px solid color-mix(in srgb, var(--accent) 24%, var(--border))",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Sparkles size={14} strokeWidth={2} style={{ color: "var(--accent-text)", flexShrink: 0 }} aria-hidden />
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--accent-text)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
          Fırsattan geldi
        </span>
        <Badge variant="muted" size="sm">{HANDOFF_SOURCE_LABEL[handoff.sourceKind]}</Badge>
        <Badge variant="muted" size="sm">{handoff.suggestedPlatform}</Badge>
        {handoff.curationMethod === "deterministic" && (
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>deterministik seçim</span>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>{handoff.title}</div>
        {handoff.whyNow && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 2 }}>
            Neden şimdi? {handoff.whyNow}
            {handoff.whyNowDetail ? ` — ${handoff.whyNowDetail}` : ""}
          </div>
        )}
      </div>
      {handoff.blockedReason && (
        <div
          data-testid="handoff-blocked-note"
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--status-warn-text)",
            background: "color-mix(in srgb, var(--status-warn) 8%, var(--bg-sunken))",
            border: "1px solid color-mix(in srgb, var(--status-warn) 24%, transparent)",
            borderRadius: "var(--radius-md)",
            padding: "8px 10px",
            lineHeight: 1.55,
          }}
        >
          Üretim şu an dış engelli ({handoff.blockedReason}) — fırsat kaybolmadı, bekliyor.{" "}
          <button
            onClick={() => setActiveTab("profile-integrations")}
            style={{ background: "none", border: "none", padding: 0, color: "var(--accent-text)", fontFamily: "inherit", fontSize: "var(--text-xs)", cursor: "pointer", textDecoration: "underline" }}
          >
            Entegrasyonlar'ı aç
          </button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {primary}
        <Button size="sm" variant="ghost" onClick={onCancel} loading={cancelling} data-testid={`handoff-cancel-${handoff.id}`}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
