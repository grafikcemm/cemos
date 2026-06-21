"use client";

import Badge from "./Badge";

type StatusKind = "queue" | "source" | "news" | "generic";
type BadgeVariant = "default" | "accent" | "muted" | "blue" | "yellow" | "red" | "danger" | "success";

const STATUS_MAP: Record<StatusKind, Record<string, { variant: BadgeVariant; label: string }>> = {
  queue: {
    approved: { variant: "accent", label: "Onaylı" },
    rejected: { variant: "danger", label: "Reddedildi" },
    scheduled: { variant: "blue", label: "Planlandı" },
    published: { variant: "success", label: "Yayınlandı" },
    manual_published: { variant: "success", label: "Manuel Yayın" },
    new: { variant: "muted", label: "Yeni" },
    draft: { variant: "muted", label: "Taslak" },
  },
  source: {
    active: { variant: "success", label: "Aktif" },
    inactive: { variant: "muted", label: "Pasif" },
  },
  news: {
    raw: { variant: "muted", label: "Ham" },
    translated: { variant: "blue", label: "Çevrildi" },
    analyzed: { variant: "accent", label: "Analiz" },
    low_score: { variant: "muted", label: "Düşük Skor" },
    failed: { variant: "danger", label: "Hata" },
    quarantined: { variant: "yellow", label: "Karantina" },
  },
  generic: {},
};

type StatusBadgeProps = {
  status: string;
  kind?: StatusKind;
  size?: "xs" | "sm";
};

/** Durum enum'u → Badge variant + TR etiket. Inline status span'lerini birleştirir. */
export default function StatusBadge({ status, kind = "generic", size = "xs" }: StatusBadgeProps) {
  const entry = STATUS_MAP[kind]?.[status];
  return (
    <Badge variant={entry?.variant ?? "muted"} size={size}>
      {entry?.label ?? status}
    </Badge>
  );
}
