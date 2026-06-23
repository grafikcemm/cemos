"use client";

import { useState } from "react";
import { Save, Copy, Image as ImageIcon, CheckCircle2, Download, Circle, Dot } from "lucide-react";
import { copyToClipboard } from "@/lib/utils/clipboard";
import type { MorningDraft } from "./useDailyQueueData";

type Props = {
  draft: MorningDraft;
  onSave: (id: string, content: string) => Promise<boolean>;
  onMarkPublished: (id: string) => Promise<boolean>;
  onToast: (text: string, type: "success" | "error") => void;
};

const norm = (s: string) => s.replace(/@@/g, "").trim();

export default function DraftReviewCard({ draft, onSave, onMarkPublished, onToast }: Props) {
  const originalText = norm(draft.content || "");
  const [text, setText] = useState(norm(draft.editedContent || draft.content || ""));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(
    (draft as { generatedImageUrl?: string | null }).generatedImageUrl ?? null
  );

  const isPublished = draft.status === "manual_published" || draft.status === "published";
  // EDIT-GATE: publish stays disabled until the operator edits the AI output.
  const isEdited = norm(text) !== originalText && norm(text).length > 0;

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(draft.id, text);
    setSaving(false);
    onToast(ok ? "Taslak kaydedildi." : "Kaydetme başarısız.", ok ? "success" : "error");
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    onToast(ok ? "Metin panoya kopyalandı." : "Kopyalama başarısız.", ok ? "success" : "error");
  };

  const handleOpenX = () => {
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleGenerateImage = async () => {
    setImgLoading(true);
    try {
      const res = await fetch(`/api/queue/${draft.id}/generate-image`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.generatedImageUrl) {
        setImageUrl(data.generatedImageUrl);
        onToast(data.reused ? "Mevcut görsel kullanıldı." : "Görsel üretildi.", "success");
      } else if (data.code === "budget") {
        onToast("Aylık fal görsel bütçesi doldu.", "error");
      } else if (data.code === "not_configured") {
        onToast("Görsel üretimi yapılandırılmamış: Vercel'de FAL_KEY env değişkenini ekleyin.", "error");
      } else {
        onToast(data.error || "Görsel üretilemedi (fal anahtarı/yapılandırma?).", "error");
      }
    } catch {
      onToast("Görsel üretimi başarısız.", "error");
    } finally {
      setImgLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!isEdited) return;
    setPublishing(true);
    // Persist the edit first so the server-side edit-gate sees the change.
    await onSave(draft.id, text);
    const ok = await onMarkPublished(draft.id);
    setPublishing(false);
    onToast(ok ? "Manuel paylaşıldı olarak işaretlendi." : "İşaretleme başarısız.", ok ? "success" : "error");
  };

  return (
    <div
      style={{
        background: isPublished
          ? "color-mix(in srgb, var(--green) 6%, var(--bg-surface))"
          : "var(--gradient-surface), var(--bg-surface)",
        border: `1px solid ${isPublished ? "color-mix(in srgb, var(--green) 30%, transparent)" : "var(--border)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-3)",
        boxShadow: "var(--shadow-sm), var(--highlight-top)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        transition: "border-color var(--ease-out), background var(--ease-out)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="eyebrow" style={{ color: "var(--accent-text)" }}>@{draft.accountHandle}</span>
          <span style={{ fontSize: "var(--text-2xs)", background: "color-mix(in srgb, var(--blue) 12%, transparent)", color: "var(--blue)", padding: "1px 6px", borderRadius: "var(--radius-sm)", fontWeight: 500 }}>
            {draft.draftType}
          </span>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: "var(--radius-sm)" }}>
            {draft.mode}
          </span>
          {isEdited && !isPublished && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-2xs)", fontWeight: 500, color: "var(--accent-text)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid var(--accent-border)", padding: "1px 6px", borderRadius: "var(--radius-sm)" }}>
              <Dot size={14} strokeWidth={3} style={{ margin: "0 -4px" }} /> orijinalden farklı
            </span>
          )}
          {!isEdited && !isPublished && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", color: "var(--accent-2-text)", background: "color-mix(in srgb, var(--yellow) 12%, transparent)", padding: "1px 6px", borderRadius: "var(--radius-sm)" }}>
              <Circle size={9} strokeWidth={2.5} /> AI çıktısı düzenlenmedi
            </span>
          )}
        </div>
        {isPublished && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--green)" }}>
            <CheckCircle2 size={14} strokeWidth={2} /> Paylaşıldı
          </span>
        )}
      </div>

      {/* Editable textarea */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        disabled={isPublished}
        style={{
          width: "100%",
          background: "var(--bg-base)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3)",
          color: "var(--text-primary)",
          fontSize: "var(--text-sm)",
          lineHeight: 1.6,
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          opacity: isPublished ? 0.6 : 1,
          transition: "border-color var(--ease-out)",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
        <span>{isEdited ? "Düzenlendi" : "Orijinal AI metni"}</span>
        <span className="tnum" style={{ color: text.length > 280 ? "var(--danger)" : "var(--text-muted)", fontWeight: text.length > 280 ? 500 : 500 }}>
          {text.length} karakter
        </span>
      </div>

      {imageUrl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Üretilen görsel"
            style={{ width: "100%", maxWidth: 320, borderRadius: 8, border: "1px solid var(--border)" }}
          />
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 10, color: "var(--blue)" }}
          >
            ⬇ Görseli aç / indir
          </a>
        </div>
      )}

      {!isPublished && (
        <>
          {/* Action row */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={btnStyle("rgba(200, 224, 191,0.1)", "var(--accent-border)", "var(--accent)")}
            >
              💾 {saving ? "..." : "Kaydet"}
            </button>
            <button onClick={handleCopy} style={btnStyle("var(--bg-elevated)", "var(--border)", "var(--text-secondary)")}>
              📄 Kopyala
            </button>
            <button
              onClick={handleOpenX}
              style={btnStyle("rgba(29,155,240,0.12)", "rgba(29,155,240,0.35)", "#1d9bf0")}
            >
              𝕏 X'te Aç
            </button>
            <button
              onClick={handleGenerateImage}
              disabled={imgLoading}
              title="fal.ai (Nano Banana Pro) ile bu tweet'e görsel üret"
              style={btnStyle("rgba(236,72,153,0.12)", "rgba(236,72,153,0.35)", "#ec4899")}
            >
              🎨 {imgLoading ? "..." : imageUrl ? "Yeniden üret" : "Görsel üret"}
            </button>
            <button
              onClick={handlePublish}
              disabled={!isEdited || publishing}
              title={!isEdited ? "Önce AI çıktısını düzenleyin" : "Manuel paylaşıldı işaretle"}
              style={{
                ...btnStyle("rgba(168,85,247,0.15)", "rgba(168,85,247,0.4)", "#c084fc"),
                flex: 1,
                minWidth: 150,
                fontWeight: 500,
                cursor: isEdited && !publishing ? "pointer" : "not-allowed",
                opacity: isEdited ? 1 : 0.45,
              }}
            >
              ✓ {publishing ? "..." : "Manuel Paylaşıldı"}
            </button>
          </div>

          {!isEdited && (
            <div style={{ fontSize: 10, color: "var(--yellow)", lineHeight: 1.4 }}>
              AI çıktısını kendi sesinle düzenlemeden yayınlayamazsın.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function btnStyle(bg: string, border: string, color: string): React.CSSProperties {
  return {
    padding: "7px 12px",
    background: bg,
    border: `1px solid ${border}`,
    color,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
}
