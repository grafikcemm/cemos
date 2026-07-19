"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import Drawer from "@/components/ui/Drawer";
import { verificationLabel, freshnessWarning } from "@/lib/services/whyToday";
import { VERIFICATION_DOT } from "./readinessMeta";
import type { MorningDraft } from "./useDailyQueueData";

export type RescoreResult = {
  ok: boolean;
  judged?: boolean;
  degraded?: boolean;
  blocked?: boolean;
  error?: string;
};

type Props = {
  draft: MorningDraft;
  open: boolean;
  onClose: () => void;
  /** Phase 5A (ADR-044): açık geri bildirim (idempotent; tek servis processFeedback). */
  onFeedback: (
    feedbackType: string,
    opts: { reason?: string; idempotencyKey: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Phase 5A (ADR-044): operatör-tetikli yeniden değerlendirme (dürüst maliyet/degraded). */
  onRescore: () => Promise<RescoreResult>;
  onToast: (text: string, type: "success" | "error") => void;
};

function ageLabel(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 1) return "az önce";
  if (hours < 24) return `${Math.round(hours)} saat önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

const FEEDBACK_CHIPS: { type: string; label: string }[] = [
  { type: "not_my_tone", label: "Ses değil" },
  { type: "hook_weak", label: "Kanca zayıf" },
  { type: "too_ai", label: "Fazla yapay" },
  { type: "make_stronger", label: "Daha güçlü" },
  { type: "make_clearer", label: "Daha net" },
];

/**
 * Taslak detay drawer'ı (Faz 1C, referans ADR-021 koyu panel). Kart ile AYNI
 * hesaplanmış readiness/verification sonucunu gösterir (tutarlılık). Kaynak
 * `scannedAt` "tarandı" olarak etiketlenir — fact-check tarihi DEĞİL.
 *
 * Phase 5A (ADR-044): açık geri bildirim (thumbs + sebep chip + not) ve dürüst
 * yeniden değerlendirme (blocked/degraded/judged) burada — kart sade kalır
 * (progressive disclosure). Feedback idempotent; readiness AYRI servis (bu panel
 * onu türetmez), yeniden değerlendirme yalnız kalite sinyallerini tazeler.
 */
export default function DraftDetailDrawer({
  draft,
  open,
  onClose,
  onFeedback,
  onRescore,
  onToast,
}: Props) {
  const s = draft.scoresParsed;
  const why = draft.whyToday;
  const readiness = draft.readiness;
  const news = draft.newsItem;
  const post = draft.sourcePost;
  const age = why ? ageLabel(why.sourceAgeHours) : null;
  const isPublished = draft.status === "manual_published" || draft.status === "published";

  const [note, setNote] = useState("");
  const [busyType, setBusyType] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreState, setRescoreState] = useState<"idle" | "degraded" | "blocked">("idle");

  const submitFeedback = async (feedbackType: string) => {
    if (busyType) return;
    setBusyType(feedbackType);
    // Idempotency: (draft, feedbackType) doğal anahtarı → çift-tık/retry TEK event.
    const r = await onFeedback(feedbackType, {
      reason: note.trim() || undefined,
      idempotencyKey: `${draft.id}:${feedbackType}`,
    });
    setBusyType(null);
    if (r.ok) {
      setNote("");
      onToast("Geri bildirim kaydedildi — öğrenme sinyaline eklendi.", "success");
    } else {
      onToast(r.error || "Geri bildirim kaydedilemedi.", "error");
    }
  };

  const handleRescore = async () => {
    if (rescoring) return;
    setRescoring(true);
    setRescoreState("idle");
    const r = await onRescore();
    setRescoring(false);
    if (r.blocked) {
      setRescoreState("blocked");
      onToast(r.error || "AI değerlendirme bütçesi tükendi.", "error");
    } else if (r.ok && r.degraded) {
      setRescoreState("degraded");
      onToast("Heuristik değerlendirme yapıldı (AI judge çalışmadı).", "error");
    } else if (r.ok) {
      setRescoreState("idle");
      onToast("Yeniden değerlendirildi.", "success");
    } else {
      onToast(r.error || "Yeniden değerlendirme başarısız.", "error");
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="Taslak detayı" width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Doğrulama (5-durum) + neden bugün */}
        {why && (
          <Section title="Neden bugün?">
            <Chip dot={VERIFICATION_DOT[why.verification]} label={verificationLabel(why.verification)} />
            {why.reason && <p style={pStyle}>{why.reason}</p>}
            {freshnessWarning(why.verification) && (
              <p data-testid="drawer-freshness-warning" style={{ ...pStyle, color: "var(--status-warn)" }}>
                {freshnessWarning(why.verification)}
              </p>
            )}
            {!why.isClaimVerified && why.verification !== "unverified" && (
              <p style={{ ...pStyle, color: "var(--text-muted)" }}>
                Kaynak mevcut ≠ iddia doğrulandı. Yayından önce teyit gerekir.
              </p>
            )}
          </Section>
        )}

        {/* Kaynak — scannedAt "tarandı", fact-check DEĞİL */}
        {(news || post) && (
          <Section title="Kaynak">
            {news && (
              <SourceRow
                title={news.trTitle ?? news.originalTitle}
                url={news.url}
                meta={news.sourceVerification ? `sınıf: ${news.sourceVerification}` : undefined}
              />
            )}
            {post && (
              <SourceRow
                title={post.url}
                url={post.url}
                meta={age ? `tarandı: ${age}` : "tarandı"}
              />
            )}
          </Section>
        )}

        {/* Readiness nedenleri (kart ile aynı) */}
        {readiness && readiness.reasons.length > 0 && (
          <Section title={`Hazırlık: ${readiness.state}`}>
            <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
              {readiness.reasons.map((r) => (
                <li key={r.code} style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {r.message}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Ayrışık kalite sinyalleri (tek viral skor YOK) + yeniden değerlendir */}
        {s && (
          <Section title="Kalite sinyalleri">
            {!s.judged ? (
              <p style={{ ...pStyle, color: "var(--text-muted)" }}>Sinyaller skorlanmadı (judge koşmadı).</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Signal label="Kanca" value={s.hookStrengthScore} />
                <Signal label="Doğallık" value={s.turkishNaturalness} />
                <Signal label="Özgünlük" value={s.noveltyScore} />
                <Signal label="Persona" value={s.personaMatchScore} />
                <Signal label="Risk" value={s.riskScore} invert />
                <Signal label="Sızıntı" value={s.leakCount} invert raw />
              </div>
            )}
            {!isPublished && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <button
                  type="button"
                  data-testid="detail-rescore"
                  onClick={handleRescore}
                  disabled={rescoring}
                  style={rescoreBtn}
                >
                  <RefreshCw size={13} strokeWidth={2} />
                  {rescoring ? "Yeniden değerlendiriliyor…" : "Yeniden değerlendir"}
                </button>
                <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                  AI judge çağırır (aylık AI bütçesinden düşer). Kredi yoksa dürüst engellenir.
                </span>
                {rescoreState === "blocked" && (
                  <p data-testid="detail-rescore-blocked" style={{ ...pStyle, color: "var(--status-warn)", margin: 0 }}>
                    AI kredisi yok — yeniden değerlendirilemedi. Skorlar değişmedi.
                  </p>
                )}
                {rescoreState === "degraded" && (
                  <p data-testid="detail-rescore-degraded" style={{ ...pStyle, color: "var(--status-warn)", margin: 0 }}>
                    Heuristik değerlendirme (AI judge çalışmadı) — sayılar tahminidir.
                  </p>
                )}
              </div>
            )}
          </Section>
        )}

        {/* Açık geri bildirim (Phase 5A / ADR-044) — öğrenme sinyaline bağlı, idempotent */}
        {!isPublished && (
          <Section title="Geri bildirim">
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                data-testid="detail-feedback-good"
                onClick={() => submitFeedback("approved")}
                disabled={!!busyType}
                style={{ ...fbBtn, borderColor: "var(--status-ok)", color: "var(--status-ok-text)" }}
              >
                <ThumbsUp size={14} strokeWidth={2} /> İyi
              </button>
              <button
                type="button"
                data-testid="detail-feedback-bad"
                onClick={() => submitFeedback("rejected")}
                disabled={!!busyType}
                style={{ ...fbBtn, borderColor: "var(--status-error)", color: "var(--status-error)" }}
              >
                <ThumbsDown size={14} strokeWidth={2} /> Zayıf
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FEEDBACK_CHIPS.map((c) => (
                <button
                  key={c.type}
                  type="button"
                  data-testid={`detail-feedback-${c.type}`}
                  onClick={() => submitFeedback(c.type)}
                  disabled={!!busyType}
                  style={chipBtn}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Kısa not (opsiyonel) — neden?"
              rows={2}
              data-testid="detail-feedback-note"
              style={{
                width: "100%", boxSizing: "border-box", resize: "vertical",
                background: "var(--bg-sunken)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)", padding: "8px 10px",
                color: "var(--text-primary)", fontSize: "var(--text-sm)", fontFamily: "inherit",
              }}
            />
            <p style={{ ...pStyle, color: "var(--text-muted)", fontSize: "var(--text-2xs)", margin: 0 }}>
              Geri bildirim öğrenme sinyaline işlenir (idempotent — çift-tık çoğaltmaz). &quot;İyi/Zayıf&quot; durumu da günceller.
            </p>
          </Section>
        )}

        {/* Üretim izi — model/maliyet katlanmış (derin trace Faz 2) */}
        {s && (
          <details>
            <summary style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", cursor: "pointer", listStyle: "none" }}>
              Üretim izi (model · açı · pattern)
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              <KV k="Yazar modeli" v={s.writerModel} />
              <KV k="Yargı modeli" v={s.judgeModel} />
              <KV k="Son editör" v={s.finalEditorModel} />
              <KV k="Açı" v={s.angle} />
              <KV k="Pattern" v={s.patternUsed ?? undefined} />
              {s.reasoning && <p style={{ ...pStyle, color: "var(--text-muted)", marginTop: 4 }}>{s.reasoning}</p>}
            </div>
          </details>
        )}
      </div>
    </Drawer>
  );
}

const pStyle: React.CSSProperties = { margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 };

const fbBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1,
  height: 34, background: "transparent", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)", fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

const chipBtn: React.CSSProperties = {
  height: 30, padding: "0 12px", background: "transparent", color: "var(--text-secondary)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-pill)",
  fontSize: "var(--text-xs)", fontFamily: "inherit", cursor: "pointer",
};

const rescoreBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, alignSelf: "flex-start",
  height: 32, padding: "0 12px", background: "transparent", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-xs)", fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h4 style={{ margin: 0, fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {title}
      </h4>
      {children}
    </section>
  );
}

function Chip({ dot, label }: { dot: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function SourceRow({ title, url, meta }: { title: string; url: string; meta?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", color: "var(--accent-text)", textDecoration: "none", wordBreak: "break-word" }}
      >
        <ExternalLink size={13} strokeWidth={2} style={{ flexShrink: 0 }} /> {title}
      </a>
      {meta && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{meta}</span>}
    </div>
  );
}

function Signal({ label, value, invert, raw }: { label: string; value: number | null; invert?: boolean; raw?: boolean }) {
  if (value == null) {
    return <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{label}: —</div>;
  }
  const good = raw ? value === 0 : invert ? value <= 30 : value >= 70;
  const bad = raw ? value > 0 : invert ? value >= 60 : value <= 45;
  const color = bad ? "var(--status-error)" : good ? "var(--status-ok-text)" : "var(--text-secondary)";
  return (
    <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
      {label}{" "}
      <strong className="tnum" style={{ color, fontWeight: 600 }}>{Math.round(value)}</strong>
    </div>
  );
}

function KV({ k, v }: { k: string; v?: string }) {
  if (!v || v === "unknown") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "var(--text-2xs)" }}>
      <span style={{ color: "var(--text-muted)" }}>{k}</span>
      <span className="font-mono" style={{ color: "var(--text-secondary)", wordBreak: "break-all", textAlign: "right" }}>{v}</span>
    </div>
  );
}
