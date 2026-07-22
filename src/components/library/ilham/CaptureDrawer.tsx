"use client";

import { useState } from "react";
import { Link2, StickyNote } from "lucide-react";
import { Button, Drawer, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

/**
 * İlham yakalama drawer'ı (Phase 3C §A). Tek atomik POST /api/inspiration/capture:
 * ContentItem + BoardItem tek transaction — iki-request orphan riski KALKTI.
 * URL fetch edilmez; caption/transcript/metrik operatör beyanıdır ve öyle
 * etiketlenir. Otomatik AI çağrısı YOK.
 */

const FORMAT_OPTIONS = [
  { value: "", label: "Format (URL'den tahmin)" },
  { value: "ig_reel", label: "Reel" },
  { value: "ig_carousel", label: "Carousel" },
  { value: "ig_static", label: "Statik gönderi" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  accountId: string;
  boardId: string;
  onSaved: () => void;
};

export default function CaptureDrawer({ open, onClose, accountId, boardId, onSaved }: Props) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("");
  const [handle, setHandle] = useState("");
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState("");
  const [note, setNote] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [views, setViews] = useState("");
  const [busy, setBusy] = useState(false);

  const parseMetric = (s: string): number | undefined => {
    const n = Number(s.replace(/[.\s]/g, ""));
    return Number.isFinite(n) && n >= 0 && s.trim() !== "" ? Math.floor(n) : undefined;
  };

  const save = async () => {
    if (!url.trim()) {
      toast.error("Instagram gönderi URL'si gerekli.");
      return;
    }
    if (!accountId) {
      toast.error("Önce hesap seç.");
      return;
    }
    const manualLikes = parseMetric(likes);
    const manualComments = parseMetric(comments);
    const manualViews = parseMetric(views);
    const hasMetrics = manualLikes !== undefined || manualComments !== undefined || manualViews !== undefined;
    setBusy(true);
    try {
      const res = await fetch("/api/inspiration/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          ...(boardId ? { boardId } : {}),
          url: url.trim(),
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(format ? { format } : {}),
          ...(handle.trim() ? { creatorHandle: handle.trim() } : {}),
          ...(caption.trim() ? { caption: caption.trim() } : {}),
          ...(transcript.trim() ? { transcript: transcript.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(hasMetrics
            ? {
                manualMetrics: {
                  ...(manualLikes !== undefined ? { likes: manualLikes } : {}),
                  ...(manualComments !== undefined ? { comments: manualComments } : {}),
                  ...(manualViews !== undefined ? { views: manualViews } : {}),
                },
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Kaydedilemedi.");
        return;
      }
      toast.success(json.created ? "İlham kaydedildi." : "Kayıt güncellendi (aynı gönderi zaten panodaydı).");
      setUrl("");
      setTitle("");
      setFormat("");
      setHandle("");
      setCaption("");
      setTranscript("");
      setNote("");
      setLikes("");
      setComments("");
      setViews("");
      onClose();
      onSaved();
    } catch {
      toast.error("Kaydedilemedi (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="İlham kaydet" width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Instagram gönderi URL'si (reel / p / tv)">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/…"
            iconLeft={<Link2 size={15} />}
            aria-label="Instagram URL"
            data-testid="ilham-capture-url"
          />
        </Field>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Format" style={{ flex: "1 1 160px" }}>
            <Select
              aria-label="Format"
              options={FORMAT_OPTIONS}
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            />
          </Field>
          <Field label="Üretici (@handle, opsiyonel)" style={{ flex: "1 1 160px" }}>
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@rakip" aria-label="Üretici handle" />
          </Field>
        </div>
        <Field label="Başlık / etiket (opsiyonel)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kısa etiket" aria-label="Başlık" />
        </Field>
        <Field label="Caption (kopyala-yapıştır; analiz için)">
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            aria-label="Caption"
            placeholder="Gönderinin caption metni — analiz caption yapısını buradan çıkarır."
            data-testid="ilham-capture-caption"
          />
        </Field>
        <Field label="Transcript / anlatım (opsiyonel)">
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            aria-label="Transcript"
            placeholder="Reel'de söylenenler (varsa)."
          />
        </Field>
        <Field label="Not — neden ilham verici?">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            aria-label="Not"
            placeholder="Bu içerik neden dikkatini çekti? (yapı, hook, format)"
          />
        </Field>
        <div>
          <FieldLabelText>Gördüğün metrikler (opsiyonel — operatör gözlemi, Meta verisi DEĞİL)</FieldLabelText>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 5 }}>
            <Input value={likes} onChange={(e) => setLikes(e.target.value)} placeholder="Beğeni" aria-label="Beğeni (manuel)" style={{ flex: "1 1 90px" }} />
            <Input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Yorum" aria-label="Yorum (manuel)" style={{ flex: "1 1 90px" }} />
            <Input value={views} onChange={(e) => setViews(e.target.value)} placeholder="İzlenme" aria-label="İzlenme (manuel)" style={{ flex: "1 1 90px" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button
            variant="primary"
            onClick={save}
            loading={busy}
            iconLeft={<StickyNote size={14} strokeWidth={2} />}
            data-testid="ilham-capture-save"
          >
            Kaydet
          </Button>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-faint)" }}>
            URL fetch edilmez — kayıt yalnız girdiğin bilgilerle oluşur.
          </span>
        </div>
      </div>
    </Drawer>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      <FieldLabelText>{label}</FieldLabelText>
      {children}
    </label>
  );
}

function FieldLabelText({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </span>
  );
}
