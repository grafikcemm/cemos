"use client";

import { Sparkles, Bookmark, FolderOpen, Microscope } from "lucide-react";
import { Button } from "@/components/ui";
import type { IlhamWorkspace } from "@/components/library/ilham/useIlhamWorkspace";

/**
 * Kütüphane/İlham bağlamsal sağ rail (Phase 4B / ADR-041). Geniş ekranda ana
 * grid'in yanında; ≤1200px'de altına düşer. YALNIZ gerçek workspace verisi:
 * aktif pano, kaydedilen toplam, son analizler, hızlı yakalama. Sahte KPI/
 * thumbnail YOK; veri yoksa dürüst boş durum.
 */

type Props = {
  workspace: IlhamWorkspace;
  onCaptureOpen: () => void;
};

export default function IlhamContextRail({ workspace, onCaptureOpen }: Props) {
  const activeBoard = workspace.boards.find((b) => b.id === workspace.selectedBoardId) ?? null;
  const savedTotal = workspace.boards.reduce((sum, b) => sum + b.itemCount, 0);
  const analyzed = workspace.items.filter((it) => it.meta?.analysis);

  return (
    <aside
      className="ilham-rail"
      aria-label="İlham bağlam paneli"
      style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}
    >
      {/* Hızlı yakalama */}
      <div style={cardStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={eyebrow}>Hızlı yakala</span>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            URL, caption veya transcript ile bir gönderiyi panoya kaydet.
          </p>
          <Button size="sm" variant="primary" onClick={onCaptureOpen} iconLeft={<Sparkles size={14} strokeWidth={2} />}>
            Yakala
          </Button>
        </div>
      </div>

      {/* Aktif pano + kayıt özeti */}
      <div style={cardStyle}>
        <span style={eyebrow}>Aktif pano</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <FolderOpen size={16} strokeWidth={2} color="var(--accent-text)" />
          <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeBoard ? activeBoard.name : "Pano seçilmedi"}
          </span>
          {activeBoard && (
            <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              {activeBoard.itemCount}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-faint)" }}>
          <Stat icon={<Bookmark size={13} strokeWidth={2} />} label="Kayıt" value={savedTotal} />
          <Stat icon={<FolderOpen size={13} strokeWidth={2} />} label="Pano" value={workspace.boards.length} />
          <Stat icon={<Microscope size={13} strokeWidth={2} />} label="Analiz" value={analyzed.length} />
        </div>
      </div>

      {/* Son analizler */}
      <div style={cardStyle}>
        <span style={eyebrow}>Son analizler</span>
        {analyzed.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
            Henüz analiz yok — bir kaydı açıp ücretsiz yapısal analizi çalıştır.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {analyzed.slice(0, 5).map((it) => {
              const a = it.meta?.analysis;
              const author = it.content?.author || it.meta?.creatorHandle || "—";
              return (
                <div key={it.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    @{author}
                  </span>
                  <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a?.hookType ? `hook: ${a.hookType}` : "yapısal analiz"} · {it.meta?.format ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: "14px 16px",
};

const eyebrow: React.CSSProperties = {
  fontSize: "var(--text-2xs)",
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: "var(--text-2xs)" }}>
        {icon}
        {label}
      </span>
      <span className="tnum" style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}
