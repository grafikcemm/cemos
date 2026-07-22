"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Drawer, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import type { AccountOpt } from "@/components/plan/useAccounts";

/**
 * İlham üst şeridi: aktif hesap seçici + pano pill'leri + pano oluşturma
 * drawer'ı (window.prompt KALKTI) + "İlham kaydet" tetikleyicisi.
 */

type Props = {
  accounts: AccountOpt[];
  accountId: string;
  onAccountChange: (id: string) => void;
  boards: Array<{ id: string; name: string; itemCount: number }>;
  boardId: string;
  onBoardChange: (id: string) => void;
  onBoardCreated: (id: string) => void;
  onCaptureOpen: () => void;
};

export default function IlhamHeaderBar({
  accounts,
  accountId,
  onAccountChange,
  boards,
  boardId,
  onBoardChange,
  onBoardCreated,
  onCaptureOpen,
}: Props) {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const createBoard = async () => {
    if (!name.trim()) {
      toast.error("Pano adı gerekli.");
      return;
    }
    if (!accountId) {
      toast.error("Önce hesap seç.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), accountId, description: description.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Pano oluşturulamadı.");
        return;
      }
      toast.success("Pano oluşturuldu.");
      setName("");
      setDescription("");
      setCreateOpen(false);
      if (json.board?.id) onBoardCreated(json.board.id);
    } catch {
      toast.error("Pano oluşturulamadı (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {accounts.length > 0 && (
        <Select
          aria-label="Aktif hesap"
          data-testid="ilham-account-select"
          options={accounts.map((a) => ({ value: a.id, label: `@${a.handle}` }))}
          value={accountId}
          onChange={(e) => onAccountChange(e.target.value)}
        />
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 }}>
        {boards.map((b) => {
          const active = b.id === boardId;
          return (
            <button
              key={b.id}
              onClick={() => onBoardChange(b.id)}
              aria-pressed={active}
              style={{
                padding: "7px 14px",
                borderRadius: "var(--radius-md)",
                border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
                background: active ? "var(--accent-dark)" : "transparent",
                color: active ? "var(--accent-text)" : "var(--text-secondary)",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {b.name}
              <span style={{ marginLeft: 6, fontSize: "var(--text-2xs)", color: active ? "var(--accent-text)" : "var(--text-faint)" }}>
                {b.itemCount}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setCreateOpen(true)}
          aria-label="Pano oluştur"
          data-testid="ilham-board-create-open"
          style={{
            padding: "7px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--border-strong)",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: "var(--text-sm)",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          + Pano
        </button>
      </div>
      <Button
        size="sm"
        variant="primary"
        onClick={onCaptureOpen}
        iconLeft={<Plus size={14} strokeWidth={2} />}
        data-testid="ilham-capture-open"
      >
        İlham kaydet
      </Button>

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Yeni pano" width={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Pano adı</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="örn. Rakip Reels kancaları"
              aria-label="Pano adı"
              data-testid="ilham-board-name"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Açıklama (opsiyonel)</FieldLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              aria-label="Pano açıklaması"
            />
          </label>
          <div>
            <Button variant="primary" onClick={createBoard} loading={busy} data-testid="ilham-board-create-save">
              Oluştur
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </span>
  );
}
