"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import EmptyState from "./EmptyState";
import Button from "./Button";

type ErrorStateProps = {
  title?: string;
  /** Türkçe, teknik-olmayan açıklama. Ham hata metni buraya GELMEZ. */
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  action?: ReactNode;
};

/**
 * Birinci sınıf HATA durumu (FIRST-SPRINT item 5): error ≠ empty.
 * Boş-durumdan görsel olarak ayrışır (danger tint) ve her zaman bir
 * "Yeniden dene" yolu sunar — ReviewQueue retry pattern'inin paylaşılan hali.
 */
export default function ErrorState({
  title = "Veri yüklenemedi",
  description = "Şu an yüklenemiyor, tekrar denendi. Sorun sürerse Ayarlar → Sistem durumu.",
  onRetry,
  retryLabel = "Yeniden dene",
  compact = true,
  action,
}: ErrorStateProps) {
  return (
    <div
      data-state="error"
      style={{
        background: "color-mix(in srgb, var(--danger) 7%, var(--bg-surface))",
        border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <EmptyState
        compact={compact}
        icon={<AlertTriangle size={18} strokeWidth={2} />}
        title={title}
        description={description}
        action={
          action ??
          (onRetry ? (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : undefined)
        }
      />
    </div>
  );
}
