"use client";

import { useMemo, useState } from "react";
import { Bookmark, Camera, Clapperboard, Layers, HelpCircle } from "lucide-react";
import { Badge, Button, EmptyState, EntityCard, Input, Select } from "@/components/ui";
import type { IlhamItem } from "@/components/library/ilham/useIlhamWorkspace";

/**
 * Kaydedilen ilhamlar: arama + format + provenance + analiz-durumu filtreleri.
 * Sahte thumbnail/KPI YOK — medya analiz edilmediği için format ikonu kullanılır;
 * çarpan yalnız provider kanıtı varsa gösterilir (insufficient → gösterilmez).
 */

const FORMAT_FILTER = [
  { value: "", label: "Tüm formatlar" },
  { value: "ig_reel", label: "Reel" },
  { value: "ig_carousel", label: "Carousel" },
  { value: "ig_static", label: "Statik" },
  { value: "unknown", label: "Bilinmeyen" },
];

const PROVENANCE_FILTER = [
  { value: "", label: "Tüm kaynaklar" },
  { value: "manual", label: "Manuel kayıt" },
  { value: "provider", label: "Provider (sync) verili" },
];

const ANALYSIS_FILTER = [
  { value: "", label: "Analiz: hepsi" },
  { value: "analyzed", label: "Analiz edildi" },
  { value: "pending", label: "Analiz bekliyor" },
];

export function formatIcon(format: string | undefined) {
  if (format === "ig_reel") return <Clapperboard size={14} strokeWidth={1.8} />;
  if (format === "ig_carousel") return <Layers size={14} strokeWidth={1.8} />;
  if (format === "ig_static") return <Camera size={14} strokeWidth={1.8} />;
  return <HelpCircle size={14} strokeWidth={1.8} />;
}

export function formatLabel(format: string | undefined): string {
  if (format === "ig_reel") return "Reel";
  if (format === "ig_carousel") return "Carousel";
  if (format === "ig_static") return "Statik";
  return "Format bilinmiyor";
}

function itemFormat(it: IlhamItem): string {
  return it.meta?.format ?? (it.content?.format || "unknown");
}

function itemProvenance(it: IlhamItem): "manual" | "provider" {
  return it.content?.sourceType === "external" ? "provider" : "manual";
}

function itemAnalyzed(it: IlhamItem): boolean {
  return Boolean(it.meta?.analysis);
}

type Props = {
  items: IlhamItem[];
  onOpen: (item: IlhamItem) => void;
  onCaptureOpen: () => void;
};

export default function InspirationGrid({ items, onOpen, onCaptureOpen }: Props) {
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("");
  const [provenance, setProvenance] = useState("");
  const [analysis, setAnalysis] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (format && itemFormat(it) !== format) return false;
      if (provenance && itemProvenance(it) !== provenance) return false;
      if (analysis === "analyzed" && !itemAnalyzed(it)) return false;
      if (analysis === "pending" && itemAnalyzed(it)) return false;
      if (q) {
        const hay = [it.title, it.note, it.meta?.caption ?? "", it.meta?.creatorHandle ?? "", it.content?.author ?? "", it.content?.body ?? ""]
          .join("\n")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, format, provenance, analysis]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ara (başlık, not, caption, @handle)"
          aria-label="İlham ara"
          style={{ flex: "1 1 220px", minWidth: 0 }}
          data-testid="ilham-search"
        />
        <Select aria-label="Format filtresi" options={FORMAT_FILTER} value={format} onChange={(e) => setFormat(e.target.value)} />
        <Select aria-label="Kaynak filtresi" options={PROVENANCE_FILTER} value={provenance} onChange={(e) => setProvenance(e.target.value)} />
        <Select aria-label="Analiz filtresi" options={ANALYSIS_FILTER} value={analysis} onChange={(e) => setAnalysis(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={<Bookmark size={22} strokeWidth={1.8} />}
            title="Bu pano boş"
            description="Beğendiğin rakip Reels/carousel'i URL + caption ile kaydet; ücretsiz deterministik yapısal analiz hemen çalışır."
            compact
            action={
              <Button variant="secondary" onClick={onCaptureOpen} data-testid="ilham-empty-capture">
                İlk içeriği kaydet
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Bookmark size={22} strokeWidth={1.8} />}
            title="Filtreye uyan kayıt yok"
            description="Filtreleri temizleyip yeniden dene."
            compact
          />
        )
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: "var(--space-4)" }}>
          {filtered.map((it) => {
            const fmt = itemFormat(it);
            const handle = it.meta?.creatorHandle || it.content?.author || "";
            const analyzed = itemAnalyzed(it);
            const showMultiplier = it.outlier && !it.outlier.insufficient && it.outlier.multiplier !== null;
            return (
              <div key={it.id} data-testid="ilham-item-card">
                <EntityCard
                  onClick={() => onOpen(it)}
                  eyebrow={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {formatIcon(fmt)} {formatLabel(fmt)}
                  </span>
                }
                title={it.title || (handle ? `@${handle}` : "İçerik")}
                body={
                  <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {it.note || it.meta?.caption || it.content?.body || "—"}
                  </span>
                }
                badges={
                  <>
                    {showMultiplier && it.outlier && (
                      <Badge variant="accent" size="xs">{it.outlier.multiplier!.toFixed(1)}×</Badge>
                    )}
                    <Badge variant="muted" size="xs">
                      {itemProvenance(it) === "provider" ? "provider verisi" : "manuel"}
                    </Badge>
                    <Badge variant={analyzed ? "success" : "muted"} size="xs">
                      {analyzed ? "analiz edildi" : "analiz bekliyor"}
                    </Badge>
                  </>
                }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
