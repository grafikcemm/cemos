"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ImageIcon,
  Info,
  PencilLine,
  Save,
  Check,
} from "lucide-react";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { assessReadiness, type ReadinessResult } from "@/lib/services/readinessService";
import { verificationLabel } from "@/lib/services/whyToday";
import Surface, { InverseCard, PeachCard } from "@/components/ui/Surface";
import DraftDetailDrawer from "./DraftDetailDrawer";
import ThreadSegmentEditor from "./ThreadSegmentEditor";
import { READINESS_META, VERIFICATION_DOT } from "./readinessMeta";
import type { MorningDraft } from "./useDailyQueueData";

type Props = {
  draft: MorningDraft;
  onSave: (id: string, content: string) => Promise<boolean>;
  onSaveSegments: (id: string, segmentsJson: string | null) => Promise<boolean>;
  onMarkPublished: (id: string) => Promise<boolean>;
  onToast: (text: string, type: "success" | "error") => void;
  /** Kuyruktaki İLK bekleyen kart — "SIRADAKİ" işareti + A/E/J/K kısayolları. */
  isNextUp?: boolean;
  /** J kısayolu: bu taslağı şimdilik atla. */
  onSkip?: () => void;
};

const norm = (s: string) => s.replace(/@@/g, "").trim();

/**
 * Bugün karar kartı (Faz 1C-e, referans ADR-021). Ton = readiness:
 *  ready → ivory ada · needs_edit → peach dikkat · blocked → koyu hata-tint.
 * Kozmetik edit-gate KALKTI (düzeltilmiş sözleşme): ready taslak düzenlenmeden
 * de yayınlanabilir. Birincil eylem intent-only "X'te aç" (ADR-017); "Paylaşıldı"
 * = manuel onay (yalnız ready). needs_edit/blocked yayınlanamaz. A/E/J/K.
 */
export default function DraftReviewCard({
  draft,
  onSave,
  onSaveSegments,
  onMarkPublished,
  onToast,
  isNextUp = false,
  onSkip,
}: Props) {
  const [text, setText] = useState(norm(draft.editedContent || draft.content || ""));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(draft.generatedImageUrl ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isThread = draft.draftType.toUpperCase() === "THREAD";
  const isPublished = draft.status === "manual_published" || draft.status === "published";
  const maxChars = draft.readinessInput?.maxChars ?? 280;

  // Canlı readiness: düzenlenen metin (veya segment) üzerinde AYNI saf fonksiyon.
  const liveReadiness: ReadinessResult = useMemo(() => {
    if (!draft.readinessInput) return draft.readiness ?? { state: "needs_edit", reasons: [] };
    return assessReadiness({ ...draft.readinessInput, editedContent: text });
  }, [draft.readinessInput, draft.readiness, text]);

  const state = liveReadiness.state;
  const meta = READINESS_META[state];
  const why = draft.whyToday;

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(draft.id, text);
    setSaving(false);
    if (ok) setEditing(false);
    onToast(ok ? "Taslak kaydedildi." : "Kaydetme başarısız.", ok ? "success" : "error");
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    onToast(ok ? "Metin panoya kopyalandı." : "Kopyalama başarısız.", ok ? "success" : "error");
  };

  // Intent-only (ADR-017): pencere açmak yayın DEĞİL. Yalnız ready'de sunulur.
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
        onToast("Aylık görsel bütçesi doldu.", "error");
      } else if (data.code === "not_configured") {
        onToast("Görsel üretimi yapılandırılmamış (FAL_KEY).", "error");
      } else {
        onToast(data.error || "Görsel üretilemedi.", "error");
      }
    } catch {
      onToast("Görsel üretimi başarısız.", "error");
    } finally {
      setImgLoading(false);
    }
  };

  // Manuel "Paylaşıldı" onayı — sunucu yayın-anı readiness'i yeniden koşar;
  // ready değilse typed hata + nedenler döner (kart zaten göstermiyor).
  const handleMarkPublished = async () => {
    if (state !== "ready") {
      onToast("Taslak yayına hazır değil — önce düzenle.", "error");
      return;
    }
    setPublishing(true);
    const ok = await onMarkPublished(draft.id);
    setPublishing(false);
    onToast(ok ? "Manuel paylaşıldı olarak işaretlendi." : "İşaretleme başarısız.", ok ? "success" : "error");
  };

  const enterEdit = () => {
    setEditing(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // A/E/J/K — yalnız NEXT UP, yazarken tetiklenmez. A=Kaydet · E=Düzenle ·
  // J=atla · K=Paylaşıldı (ready-only).
  const keyActions = useRef({ save: handleSave, publish: handleMarkPublished, skip: onSkip, edit: enterEdit });
  useEffect(() => {
    keyActions.current = { save: handleSave, publish: handleMarkPublished, skip: onSkip, edit: enterEdit };
  });
  useEffect(() => {
    if (!isNextUp || isPublished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "a") { e.preventDefault(); void keyActions.current.save(); }
      else if (k === "e") { e.preventDefault(); keyActions.current.edit(); }
      else if (k === "j") { e.preventDefault(); keyActions.current.skip?.(); }
      else if (k === "k") { e.preventDefault(); void keyActions.current.publish(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNextUp, isPublished]);

  // ── Alt bloklar ────────────────────────────────────────────────────────────
  const headerRow = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        {isNextUp && !isPublished && (
          <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--accent)", color: "var(--accent-fg)", padding: "2px 8px", borderRadius: "var(--radius-sm)" }}>
            Sıradaki
          </span>
        )}
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--sf-fg)" }}>@{draft.accountHandle}</span>
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--sf-muted)", border: "1px solid var(--sf-border)", padding: "1px 7px", borderRadius: "var(--radius-pill)" }}>
          X · {draft.draftType}
        </span>
      </div>
      {isPublished ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--status-ok-text)" }}>
          <CheckCircle2 size={14} strokeWidth={2} /> Paylaşıldı
        </span>
      ) : (
        <span data-testid="readiness-badge" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--sf-fg)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.dot, flexShrink: 0 }} />
          {meta.label}
        </span>
      )}
    </div>
  );

  const whyRow = why && (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--sf-muted)", flexWrap: "wrap" }}>
      <span data-testid="verification-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500, color: "var(--sf-fg)" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: VERIFICATION_DOT[why.verification], flexShrink: 0 }} />
        {verificationLabel(why.verification)}
      </span>
      {why.reason && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {why.reason}</span>}
    </div>
  );

  const reasonsBlock = !isPublished && state !== "ready" && liveReadiness.reasons.length > 0 && (
    <div
      data-testid="readiness-reasons"
      style={{
        display: "flex", flexDirection: "column", gap: 4,
        background: state === "blocked" ? "color-mix(in srgb, var(--status-error) 12%, transparent)" : "var(--sf-sunken)",
        border: `1px solid ${state === "blocked" ? "color-mix(in srgb, var(--status-error) 34%, transparent)" : "var(--sf-border)"}`,
        borderRadius: "var(--radius-md)", padding: "8px 11px",
      }}
    >
      <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: state === "blocked" ? "var(--status-error)" : "var(--sf-fg)" }}>
        {state === "blocked" ? "Yayınlanamaz — engelleyen sorunlar:" : "Yayından önce düzelt:"}
      </span>
      {liveReadiness.reasons.map((r) => (
        <span key={r.code} style={{ fontSize: "var(--text-xs)", color: "var(--sf-muted)", lineHeight: 1.5 }}>• {r.message}</span>
      ))}
    </div>
  );

  const contentBlock = isThread ? (
    <ThreadSegmentEditor
      segmentsJson={draft.threadSegments}
      content={norm(draft.editedContent || draft.content || "")}
      disabled={isPublished}
      onSave={(json) => onSaveSegments(draft.id, json)}
      onToast={onToast}
    />
  ) : editing && !isPublished ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        style={{
          width: "100%", background: "var(--sf-sunken)", border: "1px solid var(--sf-border)", borderRadius: "var(--radius-md)",
          padding: "var(--space-3)", color: "var(--sf-fg)", fontSize: "var(--text-md)", lineHeight: 1.6, resize: "vertical",
          outline: "none", boxSizing: "border-box", fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "var(--text-2xs)" }}>
        <span className="tnum" style={{ color: text.length > maxChars ? "var(--status-error)" : "var(--sf-muted)" }}>
          {text.length}/{maxChars} karakter
        </span>
      </div>
    </div>
  ) : (
    <div
      data-testid="draft-content"
      onClick={isPublished ? undefined : enterEdit}
      style={{
        whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "var(--text-md)", lineHeight: 1.6,
        color: "var(--sf-fg)", cursor: isPublished ? "default" : "text", opacity: isPublished ? 0.7 : 1,
      }}
    >
      {text || <span style={{ color: "var(--sf-muted)" }}>(boş taslak)</span>}
    </div>
  );

  const imageBlock = imageUrl && (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Üretilen görsel" style={{ width: "100%", maxWidth: 300, borderRadius: "var(--radius-md)", border: "1px solid var(--sf-border)" }} />
    </div>
  );

  const actions = !isPublished && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {state === "ready" && (
        <button type="button" onClick={handleOpenX} data-testid="cta-open-x" style={primaryBtn}>
          <ExternalLink size={14} strokeWidth={2} /> X&apos;te aç
        </button>
      )}
      {state !== "ready" && !isThread && (
        <button type="button" onClick={enterEdit} data-testid="cta-edit" style={primaryBtn}>
          <PencilLine size={14} strokeWidth={2} /> Düzenle
        </button>
      )}
      {!isThread && (state === "ready" || editing) && (
        <button type="button" onClick={handleSave} disabled={saving} data-testid="cta-save" style={ghostBtn}>
          <Save size={13} strokeWidth={2} /> {saving ? "…" : "Kaydet"}
        </button>
      )}
      {!isThread && state === "ready" && !editing && (
        <button type="button" onClick={enterEdit} style={ghostBtn}>
          <PencilLine size={13} strokeWidth={2} /> Düzenle
        </button>
      )}
      <button type="button" onClick={handleCopy} style={ghostBtn}>
        <Copy size={13} strokeWidth={2} /> Kopyala
      </button>
      <button type="button" onClick={handleGenerateImage} disabled={imgLoading} style={ghostBtn}>
        <ImageIcon size={13} strokeWidth={2} /> {imgLoading ? "…" : imageUrl ? "Yeniden üret" : "Görsel üret"}
      </button>
      <button type="button" onClick={() => setDrawerOpen(true)} data-testid="cta-detail" style={ghostBtn}>
        <Info size={13} strokeWidth={2} /> Detay
      </button>
      {state === "ready" && (
        <button type="button" onClick={handleMarkPublished} disabled={publishing} data-testid="cta-mark-published" style={{ ...ghostBtn, marginLeft: "auto" }}>
          <Check size={13} strokeWidth={2} /> {publishing ? "…" : "Paylaşıldı"}
        </button>
      )}
    </div>
  );

  const shortcuts = isNextUp && !isPublished && (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: "var(--text-2xs)", color: "var(--sf-muted)" }}>
      <span><Kbd>A</Kbd> kaydet</span>
      <span><Kbd>E</Kbd> düzenle</span>
      <span><Kbd>J</Kbd> atla</span>
      <span><Kbd>K</Kbd> paylaşıldı</span>
    </div>
  );

  const inner = (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {headerRow}
      {whyRow}
      {reasonsBlock}
      {contentBlock}
      {imageBlock}
      {actions}
      {shortcuts}
    </div>
  );

  const testid = "draft-review-card";
  const common = { "data-testid": testid, "data-readiness": isPublished ? "published" : state } as const;

  const card = isPublished ? (
    <Surface tone="default" {...common} style={{ opacity: 0.85 }}>{inner}</Surface>
  ) : state === "ready" ? (
    <InverseCard {...common}>{inner}</InverseCard>
  ) : state === "needs_edit" ? (
    <PeachCard {...common}>{inner}</PeachCard>
  ) : (
    <Surface tone="blocked" {...common}>{inner}</Surface>
  );

  return (
    <>
      {card}
      <DraftDetailDrawer draft={draft} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, height: "var(--control-h)", padding: "0 18px",
  background: "var(--accent)", color: "var(--accent-fg)", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-sm)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: "var(--control-h-sm)", padding: "0 12px",
  background: "transparent", color: "var(--sf-fg)", border: "1px solid var(--sf-border)", borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-xs)", fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
};

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", border: "1px solid var(--sf-border)", borderRadius: 4, padding: "0 4px", color: "var(--sf-muted)" }}>
      {children}
    </kbd>
  );
}
