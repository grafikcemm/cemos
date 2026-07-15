import type { ReadinessState } from "@/lib/services/readinessService";
import type { SurfaceTone } from "@/components/ui/Surface";
import type { VerificationState } from "@/lib/services/whyToday";

/**
 * Readiness durumu → kart tonu + rozet. Referans ADR-021: ready = ivory ada,
 * needs_edit = peach dikkat, blocked = koyu hata-tint. Rozet noktası semantik
 * renk; metin ton yüzeyinin currentColor'ını kullanır (WCAG token'lı).
 */
export const READINESS_META: Record<ReadinessState, { label: string; tone: SurfaceTone; dot: string }> = {
  ready: { label: "Yayına hazır", tone: "inverse", dot: "var(--status-ok)" },
  needs_edit: { label: "Düzenleme gerekli", tone: "peach", dot: "var(--status-warn)" },
  blocked: { label: "Yayınlanamaz", tone: "blocked", dot: "var(--status-error)" },
};

/** 5 doğrulama durumu → nokta rengi (kart/drawer aynı sonucu gösterir). */
export const VERIFICATION_DOT: Record<VerificationState, string> = {
  verified: "var(--status-ok)",
  partially_verified: "var(--status-warn)",
  source_available: "var(--text-muted)",
  unverified: "var(--text-muted)",
  stale: "var(--status-warn)",
};
