"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Inbox, Zap } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import DraftReviewCard from "./DraftReviewCard";
import { READINESS_META } from "./readinessMeta";
import type { useDailyQueueData, MorningDraft } from "./useDailyQueueData";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Skeleton from "../ui/Skeleton";
import Button from "../ui/Button";

type Props = {
  onToast: (text: string, type: "success" | "error") => void;
  /** Veri parent'ta (MorningDashboardTab) yüklenir — sayaç satırıyla paylaşılır. */
  queue: ReturnType<typeof useDailyQueueData>;
  /** Dış odak tohumu (ADR-028): fırsattan üretilen taslak kuyruğa gelince ona odaklan. */
  focusSeed?: string | null;
};

const ACCOUNT_ORDER = ["grafikcem", "maskulenkod"];

const isDone = (d: MorningDraft) =>
  d.status === "manual_published" || d.status === "published";

/**
 * Tek-odak inceleme yüzeyi: YALNIZ aktif (NEXT UP) taslak tam çalışma kartı
 * olarak açılır; kalanlar kompakt kuyruk satırlarıdır. Satıra tıklamak odağı
 * o taslağa taşır. J kısayolu sıradaki bekleyene atlar.
 */
export default function ReviewQueue({ onToast, queue, focusSeed }: Props) {
  const { drafts, loading, error, fetchDrafts, saveDraft, saveSegments, prepareIntent, markPublished, sendFeedback, rescore } = queue;
  const [generating, setGenerating] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (focusSeed) setFocusId(focusSeed);
  }, [focusSeed]);

  const ordered = ACCOUNT_ORDER.flatMap((h) => drafts.filter((d) => d.accountHandle === h));
  const pending = ordered.filter((d) => !isDone(d));
  const reviewedCount = drafts.length - pending.length;
  const allDone = drafts.length > 0 && pending.length === 0;

  // Aktif taslak: kullanıcı seçimi (hâlâ listedeyse) yoksa ilk bekleyen.
  const focused =
    (focusId && ordered.find((d) => d.id === focusId)) || pending[0] || ordered[0] || null;

  const handleSkip = () => {
    if (!focused) return;
    const rest = pending.filter((d) => d.id !== focused.id);
    if (rest.length === 0) return;
    const idx = pending.findIndex((d) => d.id === focused.id);
    const next = pending[(idx + 1) % pending.length];
    setFocusId(next.id === focused.id ? rest[0].id : next.id);
  };

  const handleGenerate = async () => {
    const confirmed = confirm(
      "Bugünkü taslakları üret? Bu işlem SocialData/OpenRouter çağrısı yapabilir (günlük limit 1 taslak/hesap)."
    );
    if (!confirmed) return;
    setGenerating(true);
    try {
      const data = await fetchJson<{
        success: boolean;
        error?: string;
        draftsCreated?: number;
        reason?: string;
      }>("/api/settings/operator-scan-now", { method: "POST" });
      if (data.success) {
        const n = data.draftsCreated ?? 0;
        if (n > 0) {
          onToast(`${n} taslak üretildi.`, "success");
        } else {
          // Honest: a 0-draft run (automation off / no candidates / all
          // quality-blocked) is NOT a success — say so with the reason.
          const reasonLabel: Record<string, string> = {
            no_enabled_sources: "otomasyon kapalı",
            daily_limit_reached: "günlük limit dolu",
            no_usable_candidates: "uygun aday yok",
            no_drafts_created: "uygun aday yok",
            budget: "bütçe limiti",
          };
          onToast(`Taslak üretilmedi (${reasonLabel[data.reason ?? ""] ?? data.reason ?? "bilinmeyen"}).`, "error");
        }
        await fetchDrafts();
      } else {
        onToast("Üretim hatası: " + (data.error || "bilinmeyen"), "error");
      }
    } catch (err) {
      onToast("Üretim hatası: " + (err instanceof Error ? err.message : "iletişim"), "error");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <Skeleton height={220} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </section>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Taslaklar yüklenemedi"
        description="Taslaklar şu an yüklenemiyor. Sorun sürerse Sistem durumuna bakın."
        onRetry={() => void fetchDrafts()}
      />
    );
  }

  if (drafts.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <EmptyState
          icon={<Inbox size={20} strokeWidth={2} />}
          title="Bugün için taslak yok"
          description="Henüz taslak üretilmedi. Hemen üret veya sabah cron'unu bekle."
          action={
            <Button
              variant="primary"
              onClick={handleGenerate}
              loading={generating}
              iconLeft={generating ? undefined : <Zap size={15} strokeWidth={2} />}
            >
              {generating ? "Üretiliyor…" : "Üret"}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Terminal durum */}
      {allDone && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "color-mix(in srgb, var(--green) 8%, var(--bg-surface))",
            border: "1px solid color-mix(in srgb, var(--green) 30%, transparent)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
          }}
        >
          <CheckCircle2 size={18} strokeWidth={2} style={{ color: "var(--green)", flexShrink: 0 }} />
          <div style={{ minWidth: 0, fontSize: "var(--text-sm)" }}>
            <strong style={{ color: "var(--text-primary)" }}>Bugünlük bitti ✓</strong>{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              {reviewedCount}/{drafts.length} taslak incelendi. Yeni taslaklar yarın sabah hazır olur.
            </span>
          </div>
        </div>
      )}

      {/* ANA ÇALIŞMA YÜZEYİ — tek aktif taslak */}
      {focused && (
        <DraftReviewCard
          key={focused.id}
          draft={focused}
          isNextUp={!isDone(focused)}
          onSave={saveDraft}
          onSaveSegments={saveSegments}
          onPrepareIntent={prepareIntent}
          onMarkPublished={markPublished}
          onFeedback={sendFeedback}
          onRescore={rescore}
          onToast={onToast}
          onSkip={handleSkip}
        />
      )}

      {/* KUYRUK — kalanlar kompakt satır */}
      {ordered.length > 1 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span className="eyebrow" style={{ color: "var(--text-muted)" }}>
              Kuyruk
            </span>
            <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
              {reviewedCount}/{drafts.length} incelendi
            </span>
          </div>
          <div
            style={{
              border: "1px solid var(--border-faint)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            {ordered
              .filter((d) => d.id !== focused?.id)
              .map((d, i, arr) => (
                <QueueRow
                  key={d.id}
                  draft={d}
                  last={i === arr.length - 1}
                  onClick={() => setFocusId(d.id)}
                />
              ))}
          </div>
        </div>
      )}

      {/* Eksik hesap için üret satırı */}
      {ACCOUNT_ORDER.filter((h) => !drafts.some((d) => d.accountHandle === h)).map((h) => (
        <div
          key={h}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 12px",
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-sm)",
            color: "var(--text-secondary)",
          }}
        >
          <span>
            @{h} için bugün taslak yok.
          </span>
          <Button size="sm" variant="primary" onClick={handleGenerate} loading={generating}>
            {generating ? "Üretiliyor…" : "Üret"}
          </Button>
        </div>
      ))}
    </section>
  );
}

/** Kompakt kuyruk satırı — hesap, metin kesiti, durum. */
function QueueRow({
  draft,
  last,
  onClick,
}: {
  draft: MorningDraft;
  last: boolean;
  onClick: () => void;
}) {
  const done = isDone(draft);
  const rState = draft.readiness?.state;
  const rMeta = rState ? READINESS_META[rState] : null;
  const snippet = (draft.editedContent || draft.content || "").replace(/\s+/g, " ").trim();

  return (
    <button
      onClick={onClick}
      data-testid={`queue-row-${draft.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        minHeight: 44,
        padding: "0 12px",
        background: "transparent",
        border: "none",
        borderBottom: last ? "none" : "1px solid var(--border-faint)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        opacity: done ? 0.55 : 1,
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {done ? (
        <CheckCircle2 size={14} strokeWidth={2} style={{ color: "var(--status-ok)", flexShrink: 0 }} />
      ) : (
        <span
          aria-hidden
          style={{ width: 9, height: 9, borderRadius: "50%", background: rMeta?.dot ?? "var(--text-muted)", flexShrink: 0 }}
        />
      )}
      <span
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--accent-text)",
          fontWeight: 500,
          flexShrink: 0,
          width: 96,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        @{draft.accountHandle}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: "var(--text-sm)",
          color: done ? "var(--text-muted)" : "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {snippet || "(boş taslak)"}
      </span>
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flexShrink: 0 }}>
        {done ? "paylaşıldı" : rMeta ? rMeta.label : draft.draftType}
      </span>
    </button>
  );
}
