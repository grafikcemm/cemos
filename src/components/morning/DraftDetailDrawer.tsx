"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import Drawer from "@/components/ui/Drawer";
import { verificationLabel, freshnessWarning } from "@/lib/services/whyToday";
import { VERIFICATION_DOT } from "./readinessMeta";
import type { MorningDraft } from "./useDailyQueueData";

type Props = {
  draft: MorningDraft;
  open: boolean;
  onClose: () => void;
};

function ageLabel(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 1) return "az önce";
  if (hours < 24) return `${Math.round(hours)} saat önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

/**
 * Taslak detay drawer'ı (Faz 1C, referans ADR-021 koyu panel). Kart ile AYNI
 * hesaplanmış readiness/verification sonucunu gösterir (tutarlılık). Kaynak
 * `scannedAt` "tarandı" olarak etiketlenir — fact-check tarihi DEĞİL. Model/maliyet
 * ve üretim izi katlanmış. Derin GenerationRun trace'i Faz 2.
 */
export default function DraftDetailDrawer({ draft, open, onClose }: Props) {
  const s = draft.scoresParsed;
  const why = draft.whyToday;
  const readiness = draft.readiness;
  const news = draft.newsItem;
  const post = draft.sourcePost;
  const age = why ? ageLabel(why.sourceAgeHours) : null;

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

        {/* Ayrışık kalite sinyalleri (tek viral skor YOK) */}
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
