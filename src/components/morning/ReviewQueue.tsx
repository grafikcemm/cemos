"use client";

import { useState } from "react";
import { AlertTriangle, Inbox, Zap } from "lucide-react";
import { fetchJson } from "@/lib/utils/safeFetch";
import DraftReviewCard from "./DraftReviewCard";
import { useDailyQueueData, type MorningDraft } from "./useDailyQueueData";
import EmptyState from "../ui/EmptyState";
import Skeleton from "../ui/Skeleton";
import Button from "../ui/Button";

type Props = {
  onToast: (text: string, type: "success" | "error") => void;
};

const ACCOUNT_ORDER = ["grafikcem", "maskulenkod"];

export default function ReviewQueue({ onToast }: Props) {
  const { drafts, loading, error, fetchDrafts, saveDraft, markPublished } = useDailyQueueData();
  const [generating, setGenerating] = useState(false);

  const reviewedCount = drafts.filter(
    (d) => d.status === "manual_published" || d.status === "published"
  ).length;

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
        <div
          style={{
            background: "color-mix(in srgb, var(--danger) 7%, var(--bg-surface))",
            border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <EmptyState
            compact
            icon={<AlertTriangle size={18} strokeWidth={2} />}
            title="Taslaklar yüklenemedi"
            description={error}
            action={
              <Button size="sm" variant="secondary" onClick={() => void fetchDrafts()}>
                Yeniden dene
              </Button>
            }
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {byAccount.map((group) => (
            <AccountGroup
              key={group.handle}
              handle={group.handle}
              items={group.items}
              generating={generating}
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
  onGenerate,
  onSave,
  onMarkPublished,
  onToast,
}: {
  handle: string;
  items: MorningDraft[];
  generating: boolean;
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
