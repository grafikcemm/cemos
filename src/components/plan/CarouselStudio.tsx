"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers, Wand2, ArrowUp, ArrowDown, Trash2, Plus, CheckCircle2 } from "lucide-react";
import { Card, Badge, Button, Drawer, Input, Textarea, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

/**
 * Carousel üretim + review stüdyosu (ADR-036 §H — Plan/Seriler içinde; yeni
 * ekran/nav YOK). ÜÇ DURUM AYRI GÖSTERİLİR: üretim, site/kanıt doğrulaması,
 * insan onayı. "Model üretti" ≠ "yayına hazır"; Onayla AÇIK insan onayıdır.
 * Kapı kapalıyken dürüst blocked (yalnız ENV adları).
 */

export type StudioSeries = {
  id: string;
  seriesKey: string;
  name: string;
  version: number;
  promptVersion: string;
};

type DossierListRow = {
  id: string;
  title: string;
  format: string;
  finalReadiness: string;
  createdAt: string;
  updatedAt: string;
};

type Slide = { n: number; copy: string; visual: string };

type DetailResponse = {
  success: boolean;
  dossier: { id: string; title: string; updatedAt: string; costUsd: number };
  content: { format: string; cover: string; slides: Slide[]; caption: string; hashtags: string[] };
  contentHash: string;
  evidence: { readiness: string; verificationId: string | null; expiry: string | null };
  creative: { status: string; issues: Array<{ code: string; message: string }> };
  approval: { approved: boolean; trainingExampleId?: string };
  provenance: { seriesKey: string | null; promptVersion: string | null; model: string | null };
};

const CREATIVE_META: Record<string, { label: string; variant: "success" | "yellow" | "danger" | "muted" }> = {
  ready_for_review: { label: "onaya hazır", variant: "success" },
  needs_edit: { label: "düzenleme gerek", variant: "yellow" },
  blocked: { label: "bloklu", variant: "danger" },
};
const EVIDENCE_META: Record<string, { label: string; variant: "success" | "yellow" | "danger" }> = {
  ready: { label: "kanıt taze", variant: "success" },
  needs_verify: { label: "kanıt bayat", variant: "yellow" },
  not_ready: { label: "kanıt yok", variant: "danger" },
};

export default function CarouselStudio({
  accountId,
  series,
  prefillTopic,
  prefillHandoffId,
  onPrefillConsumed,
}: {
  accountId: string | undefined;
  series: StudioSeries | null;
  prefillTopic?: string;
  prefillHandoffId?: string;
  onPrefillConsumed?: () => void;
}) {
  const toast = useToast();
  const [topic, setTopic] = useState("");
  const [handoffId, setHandoffId] = useState<string | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [gateMissing, setGateMissing] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [rows, setRows] = useState<DossierListRow[] | null>(null);
  const [listLoading, setListLoading] = useState(false);

  // Review drawer
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState<{
    cover: string;
    slides: Slide[];
    caption: string;
    hashtags: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  useEffect(() => {
    if (prefillTopic) {
      setTopic(prefillTopic);
      setHandoffId(prefillHandoffId);
      onPrefillConsumed?.();
    }
  }, [prefillTopic, prefillHandoffId, onPrefillConsumed]);

  const loadList = useCallback(async () => {
    if (!accountId) return;
    setListLoading(true);
    try {
      const res = await fetch(`/api/reels/dossier?accountId=${encodeURIComponent(accountId)}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setRows(
          (json.dossiers as Array<DossierListRow & { format: string }>).filter(
            (d) => d.format === "carousel"
          )
        );
      }
    } catch {
      /* liste fail-soft */
    } finally {
      setListLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const generate = async () => {
    if (!accountId || !series || topic.trim().length < 3) return;
    setGenerating(true);
    setGateMissing(null);
    setNote(null);
    try {
      const res = await fetch("/api/instagram/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          seriesKey: series.seriesKey,
          topic: topic.trim(),
          sourceHandoffId: handoffId,
          expectedSeriesVersion: series.version,
          expectedPromptVersion: series.promptVersion,
        }),
      });
      const json = await res.json();
      if (res.status === 422 && json.code === "generation_gate_closed") {
        setGateMissing(json.missing ?? []);
        return;
      }
      if (!res.ok || !json.success) {
        setNote(json.error ?? "Üretim başarısız.");
        return;
      }
      if (json.status === "already_exists") {
        setNote("Bu konu için taze bir bölüm zaten üretilmiş — listeden aç.");
      } else {
        toast.success("Bölüm üretildi — incele ve onayla.");
        setTopic("");
        setHandoffId(undefined);
      }
      await loadList();
      const id = json.dossierId as string | undefined;
      if (id) openReview(id);
    } catch {
      setNote("Üretim başarısız (ağ hatası).");
    } finally {
      setGenerating(false);
    }
  };

  const openReview = async (id: string) => {
    if (!accountId) return;
    setOpenId(id);
    setDetail(null);
    setDraft(null);
    setDetailLoading(true);
    setAuditOpen(false);
    try {
      const res = await fetch(
        `/api/reels/dossier/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`
      );
      const json = (await res.json()) as DetailResponse;
      if (res.ok && json.success) {
        setDetail(json);
        setDraft({
          cover: json.content.cover,
          slides: json.content.slides.map((s) => ({ ...s })),
          caption: json.content.caption,
          hashtags: json.content.hashtags.join(" "),
        });
      }
    } catch {
      /* detay fail-soft — drawer hata notu gösterir */
    } finally {
      setDetailLoading(false);
    }
  };

  const mutateSlides = (fn: (slides: Slide[]) => Slide[]) => {
    setDraft((d) => (d ? { ...d, slides: fn(d.slides).map((s, i) => ({ ...s, n: i + 1 })) } : d));
  };

  const save = async (): Promise<boolean> => {
    if (!accountId || !detail || !draft) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/reels/dossier/${encodeURIComponent(detail.dossier.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          expectedUpdatedAt: detail.dossier.updatedAt,
          carousel: {
            cover: draft.cover,
            slides: draft.slides.map((s) => ({ copy: s.copy, visual: s.visual })),
            caption: draft.caption,
            hashtags: draft.hashtags.split(/\s+/).filter(Boolean),
          },
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        toast.error("Dossier bu arada değişti — yeniden yüklendi.");
        await openReview(detail.dossier.id);
        return false;
      }
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Kaydedilemedi.");
        return false;
      }
      toast.success("Kaydedildi — readiness yeniden hesaplandı.");
      await openReview(detail.dossier.id);
      return true;
    } catch {
      toast.error("Kaydedilemedi (ağ hatası).");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!accountId || !detail) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/reels/dossier/${encodeURIComponent(detail.dossier.id)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, expectedUpdatedAt: detail.dossier.updatedAt }),
        }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(
          json.alreadyApproved ? "Bu bölüm zaten onaylıydı." : "Onaylandı — seri hafızasına eklendi."
        );
        await openReview(detail.dossier.id);
        await loadList();
      } else {
        toast.error(json.error ?? "Onay reddedildi.");
        if (json.code === "stale" || json.code === "series_version_changed") {
          await openReview(detail.dossier.id);
        }
      }
    } catch {
      toast.error("Onay başarısız (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  const creative = detail ? CREATIVE_META[detail.creative.status] ?? CREATIVE_META.needs_edit : null;

  return (
    <Card variant="feature" padded>
      <div data-testid="carousel-studio">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h3 className="font-display" style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
              Bölüm üretimi
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              {series ? `"${series.name}" (v${series.version}/${series.promptVersion}) sözleşmesiyle carousel üretir — onaylanmadan seri hafızasına GİRMEZ.` : "Önce bir seri seç."}
            </p>
          </div>
          <Layers size={18} strokeWidth={1.8} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        </div>

        {/* Üretim satırı */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Bölüm konusu (örn. Yeni mockup araçları)"
              aria-label="Bölüm konusu"
              data-testid="studio-topic"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={generate}
            loading={generating}
            disabled={!accountId || !series || topic.trim().length < 3}
            iconLeft={<Wand2 size={14} strokeWidth={2} />}
            data-testid="studio-generate"
          >
            Bölüm üret
          </Button>
        </div>
        {handoffId && (
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
            Kaynak: fırsat aktarımı ({handoffId.slice(0, 8)}…) — üretim provenance&apos;a işlenir.
          </p>
        )}

        {/* Kapı kapalı — dürüst blocked (yalnız ENV adları) */}
        {gateMissing && (
          <div
            data-testid="studio-gate-blocked"
            style={{ marginTop: 12, padding: "12px 14px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)" }}
          >
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>
              Canlı üretim kapısı kapalı
            </p>
            <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Eksik ortam değişkenleri: {gateMissing.join(", ")}. Değerler gösterilmez; kapı
              kapalıyken hiçbir model/site çağrısı yapılmaz.
            </p>
          </div>
        )}
        {note && (
          <p style={{ margin: "10px 0 0", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }} data-testid="studio-note">
            {note}
          </p>
        )}

        {/* Üretilen bölümler */}
        <div style={{ height: 1, background: "var(--border-faint)", margin: "16px 0" }} />
        <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
          Üretilen bölümler
        </div>
        {listLoading && !rows ? (
          <Skeleton lines={2} />
        ) : !rows || rows.length === 0 ? (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Henüz üretilmiş carousel bölümü yok.
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.slice(0, 8).map((r) => (
              <button
                key={r.id}
                onClick={() => openReview(r.id)}
                data-testid={`studio-row-${r.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  textAlign: "left",
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--border-faint)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title}
                </span>
                <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                  {new Date(r.createdAt).toLocaleDateString("tr-TR")}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Review/edit drawer */}
        <Drawer open={!!openId} onClose={() => setOpenId(null)} title="Carousel incele & onayla" width={620}>
          {detailLoading ? (
            <Skeleton lines={6} />
          ) : !detail || !draft ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Detay yüklenemedi.</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="studio-review">
              {/* ÜÇ AYRI DURUM */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span data-testid="review-creative">
                  {creative && <Badge variant={creative.variant} size="sm">editoryal: {creative.label}</Badge>}
                </span>
                <span data-testid="review-evidence">
                  <Badge variant={(EVIDENCE_META[detail.evidence.readiness] ?? EVIDENCE_META.not_ready).variant} size="sm">
                    {detail.evidence.verificationId
                      ? `site: ${(EVIDENCE_META[detail.evidence.readiness] ?? EVIDENCE_META.not_ready).label}`
                      : "site kanıtı: araç yok"}
                  </Badge>
                </span>
                <span data-testid="review-approval">
                  <Badge variant={detail.approval.approved ? "success" : "muted"} size="sm">
                    {detail.approval.approved ? "insan onaylı" : "onay bekliyor"}
                  </Badge>
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "var(--text-2xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                &quot;Site açılıyor&quot; içerik onayı değildir; &quot;model üretti&quot; yayına hazır değildir.
                Onay AÇIK insan eylemidir ve seri hafızasına o zaman girer.
              </p>

              {detail.creative.issues.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="review-issues">
                  {detail.creative.issues.map((i, idx) => (
                    <li key={idx} style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}

              {/* Kapak */}
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Kapak</span>
                <Textarea
                  value={draft.cover}
                  onChange={(e) => setDraft((d) => (d ? { ...d, cover: e.target.value } : d))}
                  rows={2}
                  aria-label="Kapak"
                  data-testid="review-cover"
                />
              </label>

              {/* Slaytlar */}
              <div>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Slaytlar</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                  {draft.slides.map((s, i) => {
                    const words = s.copy.trim().split(/\s+/).filter(Boolean).length;
                    return (
                      <div
                        key={i}
                        data-testid={`review-slide-${i + 1}`}
                        style={{ padding: "10px 12px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", minWidth: 20 }}>#{s.n}</span>
                          <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: words > 20 ? "var(--status-danger-text, #f66)" : "var(--text-muted)" }}>
                            {words}/20 kelime
                          </span>
                          <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                            <IconBtn label="Yukarı taşı" disabled={i === 0} onClick={() => mutateSlides((sl) => { const c = [...sl]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}>
                              <ArrowUp size={13} />
                            </IconBtn>
                            <IconBtn label="Aşağı taşı" disabled={i === draft.slides.length - 1} onClick={() => mutateSlides((sl) => { const c = [...sl]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c; })}>
                              <ArrowDown size={13} />
                            </IconBtn>
                            <IconBtn label="Slaytı sil" disabled={draft.slides.length <= 1} onClick={() => mutateSlides((sl) => sl.filter((_, j) => j !== i))}>
                              <Trash2 size={13} />
                            </IconBtn>
                          </span>
                        </div>
                        <Textarea
                          value={s.copy}
                          onChange={(e) => mutateSlides((sl) => sl.map((x, j) => (j === i ? { ...x, copy: e.target.value } : x)))}
                          rows={2}
                          aria-label={`Slayt ${s.n} metni`}
                        />
                        <Input
                          value={s.visual}
                          onChange={(e) => mutateSlides((sl) => sl.map((x, j) => (j === i ? { ...x, visual: e.target.value } : x)))}
                          placeholder="Görsel notu"
                          aria-label={`Slayt ${s.n} görsel notu`}
                          style={{ marginTop: 6 }}
                        />
                      </div>
                    );
                  })}
                  <Button size="sm" variant="secondary" iconLeft={<Plus size={13} strokeWidth={2} />} onClick={() => mutateSlides((sl) => [...sl, { n: sl.length + 1, copy: "", visual: "" }])} data-testid="review-slide-add">
                    Slayt ekle
                  </Button>
                </div>
              </div>

              {/* Caption + hashtag */}
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Caption</span>
                <Textarea value={draft.caption} onChange={(e) => setDraft((d) => (d ? { ...d, caption: e.target.value } : d))} rows={3} aria-label="Caption" data-testid="review-caption" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Hashtag&apos;ler (boşlukla ayır)</span>
                <Input value={draft.hashtags} onChange={(e) => setDraft((d) => (d ? { ...d, hashtags: e.target.value } : d))} aria-label="Hashtag'ler" data-testid="review-hashtags" />
              </label>

              {/* Audit (katlanmış) */}
              <button
                onClick={() => setAuditOpen((v) => !v)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: "var(--text-2xs)", textAlign: "left", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                aria-expanded={auditOpen}
              >
                {auditOpen ? "▾" : "▸"} Maliyet & model denetimi
              </button>
              {auditOpen && (
                <p style={{ margin: 0, fontSize: "var(--text-2xs)", color: "var(--text-muted)", lineHeight: 1.6 }} data-testid="review-audit">
                  Model: {detail.provenance.model ?? "—"} · Maliyet: ${detail.dossier.costUsd.toFixed(4)} ·
                  Seri: {detail.provenance.seriesKey ?? "—"} ({detail.provenance.promptVersion ?? "—"}) ·
                  Hash: {detail.contentHash.slice(0, 12)}…
                </p>
              )}

              {/* Eylemler */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--border-faint)" }}>
                <Button variant="secondary" onClick={save} loading={busy} data-testid="review-save">
                  Kaydet
                </Button>
                <Button
                  variant="primary"
                  onClick={approve}
                  loading={busy}
                  disabled={detail.approval.approved || detail.creative.status !== "ready_for_review"}
                  iconLeft={<CheckCircle2 size={14} strokeWidth={2} />}
                  data-testid="review-approve"
                >
                  {detail.approval.approved ? "Onaylandı" : "Onayla"}
                </Button>
                <Button variant="ghost" onClick={() => setOpenId(null)}>Kapat</Button>
              </div>
            </div>
          )}
        </Drawer>
      </div>
    </Card>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        background: "transparent",
        border: "1px solid var(--border-faint)",
        borderRadius: "var(--radius-sm)",
        color: disabled ? "var(--text-faint)" : "var(--text-secondary)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
