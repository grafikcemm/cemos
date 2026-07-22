"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Scissors, ArrowUpToLine, Trash2, Plus, Save } from "lucide-react";
import { parseThreadSegments, serializeThreadSegments } from "@/lib/growth-engine/threadSegments";

type Props = {
  /** Kayıtlı segment JSON'ı (yoksa null → content'ten tek segment tohumlanır). */
  segmentsJson: string | null | undefined;
  /** Segment yoksa başlangıç tohumu (birleşik metin). */
  content: string;
  /**
   * Phase 2D (ADR-033): segment başına sert sınır — server readiness ile AYNI
   * primitive'den (effectiveThreadSegmentLimit) gelir; ayrı UI literal'i YOK.
   */
  segmentLimit: number;
  disabled?: boolean;
  onSave: (segmentsJson: string | null) => Promise<boolean>;
  onToast: (text: string, type: "success" | "error") => void;
};

function seed(segmentsJson: string | null | undefined, content: string): string[] {
  const parsed = parseThreadSegments(segmentsJson ?? null);
  if (parsed && parsed.length > 0) return parsed.map((s) => s.text);
  return [content.trim()].filter(Boolean).length ? [content.trim()] : [""];
}

/**
 * Desktop thread segment editörü (Faz 1C). Yapısal segmentler = readiness'in
 * thread doğrulaması ('1/' metni kanıt DEĞİL). Segment kartları: sırala (↑↓),
 * böl (imleç konumunda), birleştir (üstekiyle), sil, ekle. Kaydet →
 * serializeThreadSegments → PATCH threadSegments. Ton-uyumlu (--sf-* değişkenleri).
 */
export default function ThreadSegmentEditor({ segmentsJson, content, segmentLimit, disabled, onSave, onToast }: Props) {
  const [segments, setSegments] = useState<string[]>(() => seed(segmentsJson, content));
  const [saving, setSaving] = useState(false);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const dirty = useMemo(() => {
    const savedJson = serializeThreadSegments((parseThreadSegments(segmentsJson ?? null) ?? []).map((s) => ({ text: s.text })));
    const currentJson = serializeThreadSegments(segments.filter((t) => t.trim().length > 0).map((t) => ({ text: t })));
    return savedJson !== currentJson;
  }, [segments, segmentsJson]);

  const set = (next: string[]) => setSegments(next.length ? next : [""]);
  const update = (i: number, val: string) => set(segments.map((s, k) => (k === i ? val : s)));
  const addAfter = (i: number) => set([...segments.slice(0, i + 1), "", ...segments.slice(i + 1)]);
  const remove = (i: number) => set(segments.filter((_, k) => k !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= segments.length) return;
    const next = [...segments];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  const mergeUp = (i: number) => {
    if (i === 0) return;
    const next = [...segments];
    next[i - 1] = `${next[i - 1].trim()}\n${next[i].trim()}`.trim();
    next.splice(i, 1);
    set(next);
  };
  const splitAtCursor = (i: number) => {
    const el = refs.current[i];
    const pos = el ? el.selectionStart : Math.floor(segments[i].length / 2);
    const before = segments[i].slice(0, pos).trim();
    const after = segments[i].slice(pos).trim();
    set([...segments.slice(0, i), before, after, ...segments.slice(i + 1)]);
  };

  const handleSave = async () => {
    const clean = segments.map((t) => t.trim()).filter(Boolean);
    setSaving(true);
    const json = clean.length > 0 ? serializeThreadSegments(clean.map((t) => ({ text: t }))) : null;
    const ok = await onSave(json);
    setSaving(false);
    onToast(ok ? "Segmentler kaydedildi." : "Segment kaydı başarısız.", ok ? "success" : "error");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="thread-segment-editor">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--sf-muted)" }}>
          Thread segmentleri · {segments.filter((s) => s.trim()).length}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled || saving || !dirty}
          data-testid="segments-save"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: "var(--control-h-sm)", padding: "0 12px",
            background: dirty ? "var(--accent)" : "var(--sf-sunken)",
            color: dirty ? "var(--accent-fg)" : "var(--sf-muted)",
            border: `1px solid ${dirty ? "var(--accent)" : "var(--sf-border)"}`,
            borderRadius: "var(--radius-sm)", fontSize: "var(--text-xs)", fontWeight: 500,
            fontFamily: "inherit", cursor: dirty && !saving ? "pointer" : "not-allowed",
          }}
        >
          <Save size={13} strokeWidth={2} /> {saving ? "…" : "Segmentleri kaydet"}
        </button>
      </div>

      {segments.map((seg, i) => {
        const len = seg.trim().length;
        const over = len > segmentLimit;
        return (
          <div
            key={i}
            data-testid={`segment-${i}`}
            style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              background: "var(--sf-sunken)", border: `1px solid ${over ? "var(--status-error)" : "var(--sf-border)"}`,
              borderRadius: "var(--radius-md)", padding: 8,
            }}
          >
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--sf-muted)", width: 20, textAlign: "center", paddingTop: 8, flexShrink: 0 }} className="tnum">
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <textarea
                ref={(el) => { refs.current[i] = el; }}
                value={seg}
                onChange={(e) => update(i, e.target.value)}
                disabled={disabled}
                rows={2}
                style={{
                  width: "100%", background: "transparent", border: "none", outline: "none", resize: "vertical",
                  color: "var(--sf-fg)", fontSize: "var(--text-sm)", lineHeight: 1.5, fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 2 }}>
                  <SegBtn label="Yukarı taşı" onClick={() => move(i, -1)} disabled={disabled || i === 0}><ChevronUp size={13} strokeWidth={2} /></SegBtn>
                  <SegBtn label="Aşağı taşı" onClick={() => move(i, 1)} disabled={disabled || i === segments.length - 1}><ChevronDown size={13} strokeWidth={2} /></SegBtn>
                  <SegBtn label="İmleçte böl" onClick={() => splitAtCursor(i)} disabled={disabled}><Scissors size={13} strokeWidth={2} /></SegBtn>
                  <SegBtn label="Üsttekiyle birleştir" onClick={() => mergeUp(i)} disabled={disabled || i === 0}><ArrowUpToLine size={13} strokeWidth={2} /></SegBtn>
                  <SegBtn label="Segmenti sil" onClick={() => remove(i)} disabled={disabled || segments.length === 1}><Trash2 size={13} strokeWidth={2} /></SegBtn>
                </div>
                <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: over ? "var(--status-error)" : "var(--sf-muted)" }}>
                  {len}/{segmentLimit}
                </span>
              </div>
              {over && (
                <span data-testid={`segment-${i}-over-limit`} style={{ fontSize: "var(--text-2xs)", color: "var(--status-error)" }}>
                  Segment {i + 1} karakter sınırını aşıyor — böl veya kısalt.
                </span>
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => addAfter(segments.length - 1)}
        disabled={disabled}
        data-testid="segment-add"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          height: "var(--control-h-sm)", background: "transparent", border: "1px dashed var(--sf-border)",
          borderRadius: "var(--radius-sm)", color: "var(--sf-muted)", fontSize: "var(--text-xs)", fontWeight: 500,
          fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <Plus size={14} strokeWidth={2} /> Segment ekle
      </button>
    </div>
  );
}

function SegBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 26, height: 26, background: "transparent", border: "none", borderRadius: "var(--radius-sm)",
        color: "var(--sf-muted)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}
