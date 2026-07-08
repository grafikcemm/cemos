"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Dot, ShieldAlert } from "lucide-react";
import { copyToClipboard } from "@/lib/utils/clipboard";
import type { MorningDraft } from "./useDailyQueueData";

type Props = {
  draft: MorningDraft;
  onSave: (id: string, content: string) => Promise<boolean>;
  onMarkPublished: (id: string) => Promise<boolean>;
  onToast: (text: string, type: "success" | "error") => void;
  /** Kuyruktaki İLK bekleyen kart — belirgin NEXT UP çerçevesi alır. */
  isNextUp?: boolean;
};

const norm = (s: string) => s.replace(/@@/g, "").trim();

/** lintReport JSON'ından kalite kapısı Türkçe notlarını çıkarır (fail-soft). */
function extractGateNotes(lintReport: string | null | undefined): string[] {
  if (!lintReport) return [];
  try {
    const parsed = JSON.parse(lintReport) as {
      issues?: { code?: string; message?: string }[];
    };
    return (parsed.issues ?? [])
      .filter((i) => i.code === "quality_gate" && typeof i.message === "string")
      .map((i) => i.message as string);
  } catch {
    return [];
  }
}

/** Ayrışık sinyal çubukları — TEK viral sayı ASLA gösterilmez (item 7). */
function SignalRow({ draft }: { draft: MorningDraft }) {
  const s = draft.scoresParsed;
  if (!s) return null;
  if (!s.judged) {
    return (
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
        Sinyaller skorlanmadı (hızlı yol) · leak {s.leakCount ?? 0}
      </span>
    );
  }
  const chip = (label: string, value: number | null, invert = false) => {
    if (typeof value !== "number") return null;
    const good = invert ? value <= 30 : value >= 70;
    const bad = invert ? value >= 60 : value <= 45;
    const color = bad ? "var(--danger)" : good ? "var(--green)" : "var(--accent-2-text)";
    return (
      <span
        key={label}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", color: "var(--text-secondary)" }}
      >
        {label}{" "}
        <strong className="tnum" style={{ color, fontWeight: 600 }}>
          {Math.round(value)}
        </strong>
      </span>
    );
  };
  const leakColor = (s.leakCount ?? 0) > 0 ? "var(--danger)" : "var(--green)";
  return (
    <div
      aria-label="Ayrışık kalite sinyalleri"
      style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "4px 2px" }}
    >
      {chip("kanca", s.hookStrengthScore)}
      {chip("doğallık", s.turkishNaturalness)}
      {chip("özgünlük", s.noveltyScore)}
      {chip("persona", s.personaMatchScore)}
      {chip("risk", s.riskScore, true)}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", color: "var(--text-secondary)" }}>
        leak{" "}
        <strong className="tnum" style={{ color: leakColor, fontWeight: 600 }}>
          {s.leakCount ?? 0}
        </strong>
      </span>
    </div>
  );
}

export default function DraftReviewCard({ draft, onSave, onMarkPublished, onToast, isNextUp = false }: Props) {
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
  // Kalite kapısı (item 8): yüksek-şiddet leak / düşük TR doğallık / yasak klişe
  // → needs_edit. Kart GÖRÜNÜR ve düzenlenebilir; yayın/kopya akışında net uyarı.
  const needsEdit = draft.status === "needs_edit";
  const gateNotes = needsEdit ? extractGateNotes(draft.lintReport) : [];

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(draft.id, text);
    setSaving(false);
    onToast(ok ? "Taslak kaydedildi." : "Kaydetme başarısız.", ok ? "success" : "error");
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok && needsEdit && !isEdited) {
      // Kopyalama engellenmez ama kalite kapısı uyarısı net verilir.
      onToast("Kopyalandı — dikkat: bu taslak kalite kapısına takıldı, düzenlemeden paylaşma.", "error");
      return;
    }
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
        border: `1px solid ${
          isPublished
            ? "color-mix(in srgb, var(--green) 30%, transparent)"
            : isNextUp
              ? "var(--accent-border)"
              : "var(--border)"
        }`,
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-3)",
        boxShadow: isNextUp
          ? "0 0 0 1px var(--accent-border), var(--shadow-sm), var(--highlight-top)"
          : "var(--shadow-sm), var(--highlight-top)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        transition: "border-color var(--ease-out), background var(--ease-out)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {isNextUp && !isPublished && (
            <span
              className="eyebrow"
              style={{
                background: "var(--gradient-accent), var(--accent)",
                color: "var(--bg-base)",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              NEXT UP
            </span>
          )}
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
          {needsEdit && !isPublished && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)", padding: "1px 6px", borderRadius: "var(--radius-sm)" }}>
              <ShieldAlert size={11} strokeWidth={2.5} /> düzenleme gerekli
            </span>
          )}
        </div>
        {isPublished && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--green)" }}>
            <CheckCircle2 size={14} strokeWidth={2} /> Paylaşıldı
          </span>
        )}
      </div>

      {/* Ayrışık alt-sinyaller — tek "viral skor" sayısı YOK (item 7). */}
      <SignalRow draft={draft} />

      {/* Kalite kapısı Türkçe nedenleri (item 8): redirect, silme değil. */}
      {needsEdit && !isPublished && gateNotes.length > 0 && (
        <div
          style={{
            background: "color-mix(in srgb, var(--danger) 7%, transparent)",
            border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)",
            borderRadius: "var(--radius-md)",
            padding: "8px 10px",
            fontSize: "var(--text-2xs)",
            color: "var(--text-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--danger)" }}>
            Kalite kapısı: bu taslak düzenlenmeden yayınlanamaz.
          </span>
          {gateNotes.map((note, i) => (
            <span key={i}>• {note}</span>
          ))}
        </div>
      )}

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
              style={btnStyle("var(--accent-tint-12)", "var(--accent-border)", "var(--accent)")}
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
