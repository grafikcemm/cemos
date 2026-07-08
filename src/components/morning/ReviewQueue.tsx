"use client";

import { useState } from "react";
import { CheckCircle2, Inbox, Zap } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import DraftReviewCard from "./DraftReviewCard";
import type { useDailyQueueData, MorningDraft } from "./useDailyQueueData";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Skeleton from "../ui/Skeleton";
import Button from "../ui/Button";

type Props = {
  onToast: (text: string, type: "success" | "error") => void;
  /** Veri parent'ta (MorningDashboardTab) yüklenir — sayaç satırıyla paylaşılır. */
  queue: ReturnType<typeof useDailyQueueData>;
};

const ACCOUNT_ORDER = ["grafikcem", "maskulenkod"];

const isDone = (d: MorningDraft) =>
  d.status === "manual_published" || d.status === "published";

export default function ReviewQueue({ onToast, queue }: Props) {
  const { drafts, loading, error, fetchDrafts, saveDraft, markPublished } = queue;
  const [generating, setGenerating] = useState(false);

  const reviewedCount = drafts.filter(isDone).length;
  // NEXT UP: hesap sırasına göre İLK bekleyen taslak (fold üstü odak noktası).
  const nextUpId =
    ACCOUNT_ORDER.flatMap((h) => drafts.filter((d) => d.accountHandle === h)).find(
      (d) => !isDone(d),
    )?.id ?? null;
  const allDone = drafts.length > 0 && reviewedCount === drafts.length;

  // İki hesap HER ZAMAN görünür — 0-taslaklı hesap gizlenmez (boş-durum gösterir).
  const byAccount = ACCOUNT_ORDER.map((handle) => ({
    handle,
    items: drafts.filter((d) => d.accountHandle === handle),
  }));

  const handleGenerate = async () => {
    const confirmed = confirm(
      "Bugünkü taslakları üret? Bu işlem SocialData/OpenRouter çağrısı yapabilir (günlük limit 1 taslak/hesap)."
    );
    if (!confirmed) return;
    setGenerating(true);
    try {
      const data = await fetchJson<{ success: boolean; error?: string }>(
        "/api/settings/operator-scan-now",
        { method: "POST" }
      );
      if (data.success) {
        onToast("Taslak üretimi tamamlandı.", "success");
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

  return (
    <section style={{ marginBottom: "var(--space-8)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "var(--space-3)", flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: 6 }}>
            İNCELE &amp; PAYLAŞ
          </div>
          <h2
            className="font-display"
            style={{ fontSize: "var(--text-xl)", fontWeight: 500, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}
          >
            İnceleme Kuyruğu
          </h2>
        </div>
        {drafts.length > 0 && (
          <span className="tnum" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--accent-text)" }}>
            {reviewedCount}/{drafts.length}{" "}
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>incelendi</span>
          </span>
        )}
      </div>

      {drafts.length > 0 && (
        <div style={{ height: 5, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", marginBottom: "var(--space-4)" }}>
          <div
            style={{
              height: "100%",
              width: `${(reviewedCount / drafts.length) * 100}%`,
              background: "var(--gradient-accent), var(--accent)",
              borderRadius: "var(--radius-sm)",
              transition: "width var(--duration-normal, 0.3s) var(--ease-out)",
            }}
          />
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <Skeleton height={72} />
          <Skeleton height={72} />
        </div>
      ) : error ? (
        // HATA ≠ BOŞ (item 5): boş kuyruk EmptyState alır, yükleme hatası bu
        // ayrı danger bloğu + yeniden-dene alır. Ham teknik hata gösterilmez.
        <ErrorState
          title="Taslaklar yüklenemedi"
          description="Taslaklar şu an yüklenemiyor. Sorun sürerse Ayarlar → Sistem durumu."
          onRetry={() => void fetchDrafts()}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {allDone && (
            // Terminal durum: kuyruk bitti — günün işi tamam (FIRST-SPRINT item 4).
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "color-mix(in srgb, var(--green) 8%, var(--bg-surface))",
                border: "1px solid color-mix(in srgb, var(--green) 30%, transparent)",
                borderRadius: "var(--radius-lg)",
                padding: "14px 16px",
              }}
            >
              <CheckCircle2 size={20} strokeWidth={2} style={{ color: "var(--green)", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div className="font-display" style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--text-primary)" }}>
                  Bugünlük bitti ✓
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                  {reviewedCount}/{drafts.length} taslak incelendi. Yeni taslaklar yarın sabah (İstanbul ~06:00-07:00) hazır olur.
                </div>
              </div>
            </div>
          )}
          {byAccount.map((group) => (
            <AccountGroup
              key={group.handle}
              handle={group.handle}
              items={group.items}
              generating={generating}
              nextUpId={nextUpId}
              onGenerate={handleGenerate}
              onSave={saveDraft}
              onMarkPublished={markPublished}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AccountGroup({
  handle,
  items,
  generating,
  nextUpId,
  onGenerate,
  onSave,
  onMarkPublished,
  onToast,
}: {
  handle: string;
  items: MorningDraft[];
  generating: boolean;
  nextUpId: string | null;
  onGenerate: () => void;
  onSave: (id: string, content: string) => Promise<boolean>;
  onMarkPublished: (id: string) => Promise<boolean>;
  onToast: (text: string, type: "success" | "error") => void;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: "var(--space-2)", display: "flex", alignItems: "center", gap: 8 }}>
        <span>@{handle}</span>
        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
          · <span className="tnum">{items.length}</span> taslak
        </span>
      </div>
      {items.length === 0 ? (
        <div
          style={{
            background: "var(--gradient-surface), var(--bg-surface)",
            border: "1px dashed var(--border-strong)",
            borderRadius: "var(--radius-xl)",
          }}
        >
          <EmptyState
            compact
            icon={<Inbox size={18} strokeWidth={2} />}
            title={`Henüz @${handle} taslağı yok`}
            description="Bugün için bu hesaba ait taslak üretilmedi. Hemen bir tane oluştur."
            action={
              <Button
                size="sm"
                variant="primary"
                onClick={onGenerate}
                loading={generating}
                iconLeft={generating ? undefined : <Zap size={15} strokeWidth={2} />}
              >
                {generating ? "Üretiliyor…" : "Üret"}
              </Button>
            }
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {items.map((d) => (
            <DraftReviewCard
              key={d.id}
              draft={d}
              isNextUp={d.id === nextUpId}
              onSave={onSave}
              onMarkPublished={onMarkPublished}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </div>
  );
}
