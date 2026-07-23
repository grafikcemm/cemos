"use client";

import { useState } from "react";
import { Bookmark, UserX } from "lucide-react";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import IlhamHeaderBar from "@/components/library/ilham/IlhamHeaderBar";
import CaptureDrawer from "@/components/library/ilham/CaptureDrawer";
import InspirationGrid from "@/components/library/ilham/InspirationGrid";
import InspirationDetailDrawer from "@/components/library/ilham/InspirationDetailDrawer";
import CompetitorSummary from "@/components/library/ilham/CompetitorSummary";
import IlhamContextRail from "@/components/library/ilham/IlhamContextRail";
import { useIlhamWorkspace, type IlhamItem } from "@/components/library/ilham/useIlhamWorkspace";

/**
 * Kütüphane / İlham (Phase 3C) — Inspiration Intelligence çalışma alanı.
 * Account-scoped panolar + atomik ilham yakalama + ÜCRETSİZ deterministik
 * yapısal analiz + rakip watchlist/outlier özeti + AYRI ücretli AI eylemi.
 * Sahte AI/thumbnail/KPI yok; tüm durumlar dürüst (blocked ≠ error ≠ empty).
 */

export default function LibIlhamTab() {
  const ws = useIlhamWorkspace();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  if (ws.accountsLoading || (ws.loading && !ws.workspace)) {
    return (
      <Card padded>
        <div data-skeleton aria-busy="true">
          <Skeleton width={180} height={14} style={{ marginBottom: 14 }} />
          <Skeleton lines={4} />
        </div>
      </Card>
    );
  }
  if (ws.accountsFailed) {
    return <ErrorState title="Hesaplar alınamadı" description="Hesap listesi getirilemedi. Yeniden dene." onRetry={ws.reloadAccounts} />;
  }
  {/* Review PR#9 HIGH-1: bayat persist edilmiş channel listede yoksa BLANK değil dürüst hata. */}
  if (ws.channelUnknown) {
    return (
      <ErrorState
        title="Aktif hesap çözümlenemedi"
        description="Seçili hesap mevcut hesap listesinde bulunamadı. Sidebar'dan geçerli bir hesap seç."
        onRetry={ws.reloadAccounts}
      />
    );
  }
  if (ws.accounts.length === 0) {
    return (
      <EmptyState
        icon={<UserX size={22} strokeWidth={1.8} />}
        title="Aktif hesap yok"
        description="İlham kütüphanesi hesap-kapsamlıdır. Önce Ayarlar'dan bir hesap tanımla."
      />
    );
  }
  if (ws.failed) {
    return <ErrorState title="İlham çalışma alanı alınamadı" description="Veri getirilemedi. Yeniden dene." onRetry={ws.reload} />;
  }

  const workspace = ws.workspace;
  if (!workspace) return null;

  const activeItem: IlhamItem | null = activeItemId
    ? (workspace.items.find((it) => it.id === activeItemId) ?? null)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
      <IlhamHeaderBar
        accounts={ws.accounts}
        accountId={ws.accountId}
        onAccountChange={ws.switchAccount}
        boards={workspace.boards}
        boardId={ws.boardId}
        onBoardChange={ws.setBoardId}
        onBoardCreated={(id) => {
          ws.setBoardId(id);
          ws.reload();
        }}
        onCaptureOpen={() => setCaptureOpen(true)}
      />

      <div className="ilham-workspace">
        <div className="ilham-main">
          {workspace.boards.length === 0 ? (
            <EmptyState
              icon={<Bookmark size={22} strokeWidth={1.8} />}
              title="Bu hesabın panosu yok"
              description="İlk kaydında varsayılan 'Instagram İlham' panosu otomatik oluşur; ya da '+ Pano' ile kendin aç."
            />
          ) : (
            <InspirationGrid items={workspace.items} onOpen={(it) => setActiveItemId(it.id)} onCaptureOpen={() => setCaptureOpen(true)} />
          )}

          <CompetitorSummary watch={workspace.watch} outliers={workspace.outliers} />
        </div>

        <IlhamContextRail workspace={workspace} onCaptureOpen={() => setCaptureOpen(true)} />
      </div>

      <CaptureDrawer
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        accountId={ws.accountId}
        boardId={ws.boardId}
        onSaved={ws.reload}
      />
      {activeItem && (
        <InspirationDetailDrawer
          item={activeItem}
          accountId={ws.accountId}
          gate={workspace.gate}
          onClose={() => setActiveItemId(null)}
          onChanged={ws.reload}
        />
      )}
    </div>
  );
}
