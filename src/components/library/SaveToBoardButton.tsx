"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, BookmarkCheck, Plus, Check, Loader2, FolderPlus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * Kütüphaneye/panoya kaydet — TEK reusable primitive (Phase 4B / ADR-041).
 * Tümü drawer + 5 araştırma ekranı + İlham aynı `/api/library/save` sözleşmesini
 * bu bileşenle paylaşır. Client-safe kaynak referansı ({kind,id}); sunucu
 * yetkili satırı yeniden yükler. Pessimistic (sunucu sonucuyla uzlaşır) — hata
 * ASLA başarı gibi görünmez. Zaten kayıtlıysa "Kayıtlı" + pano adı.
 *
 * Menü PORTAL ile document.body'ye render edilir (fixed konum) → Drawer'ın
 * overflow/scrim stacking'inden kurtulur (yoksa scrim menü tıklamasını yer).
 */

export type SaveSourceRef =
  | { kind: "contentItem"; contentItemId: string }
  | { kind: "news"; id: string }
  | { kind: "ytVideo"; videoId: string }
  | { kind: "sourcePost"; id: string }
  | { kind: "igMedia"; mediaId: string }
  | { kind: "repo"; id: string };

export type SavedBoardRef = { boardId: string; boardName: string };

type BoardRow = { id: string; name: string; accountId: string | null };
type MenuPos = { left: number; top?: number; bottom?: number; maxHeight: number };

type Props = {
  source: SaveSourceRef;
  accountId?: string | null;
  savedBoards?: SavedBoardRef[];
  title?: string;
  size?: "sm" | "xs";
  onSaved?: (r: SavedBoardRef & { alreadySaved: boolean }) => void;
};

const MENU_WIDTH = 264;

const CODE_MESSAGE: Record<string, string> = {
  board_scope_mismatch: "Bu pano aktif hesaba ait değil.",
  board_archived: "Pano arşivlenmiş.",
  board_not_found: "Pano bulunamadı.",
  content_not_found: "İçerik bulunamadı.",
  source_not_found: "Kaynak bulunamadı — liste değişmiş olabilir.",
  unsupported_source: "Bu tür panoya kaydedilemez.",
  forbidden: "Yetki reddedildi.",
};

export default function SaveToBoardButton({ source, accountId, savedBoards, title, size = "sm", onSaved }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [saved, setSaved] = useState<SavedBoardRef[]>(savedBoards ?? []);
  const [boards, setBoards] = useState<BoardRow[] | null>(null);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [boardsFailed, setBoardsFailed] = useState(false);
  const [savingBoardId, setSavingBoardId] = useState<string | "__default__" | "__new__" | null>(null);
  const [newName, setNewName] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSaved(savedBoards ?? []);
  }, [savedBoards]);

  const computePos = useCallback((): MenuPos | null => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return null;
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    if (spaceBelow < 220 && spaceAbove > spaceBelow) {
      return { left, bottom: window.innerHeight - r.top + 4, maxHeight: Math.max(180, spaceAbove) };
    }
    return { left, top: r.bottom + 4, maxHeight: Math.max(180, spaceBelow) };
  }, []);

  const loadBoards = useCallback(async () => {
    setLoadingBoards(true);
    setBoardsFailed(false);
    try {
      const params = new URLSearchParams({ savable: "1" });
      if (accountId) params.set("accountId", accountId);
      const res = await fetch(`/api/boards?${params.toString()}`);
      if (!res.ok) throw new Error("http");
      const json = await res.json();
      if (!json.success) throw new Error("payload");
      setBoards((json.boards ?? []).map((b: BoardRow) => ({ id: b.id, name: b.name, accountId: b.accountId })));
    } catch {
      setBoardsFailed(true);
      setBoards([]);
    } finally {
      setLoadingBoards(false);
    }
  }, [accountId]);

  const openMenu = useCallback(() => {
    setMenuPos(computePos());
    setOpen(true);
  }, [computePos]);

  // Panel açılınca: panoları getir + dışarı-tık / Escape / scroll-resize yönetimi.
  useEffect(() => {
    if (!open) return;
    if (boards === null && !loadingBoards) void loadBoards();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function reposition() {
      setMenuPos(computePos());
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, boards, loadingBoards, loadBoards, computePos]);

  const isSavedTo = (boardId: string) => saved.some((s) => s.boardId === boardId);

  const doSave = useCallback(
    async (boardId: string | undefined, marker: string) => {
      setSavingBoardId(marker);
      try {
        const res = await fetch("/api/library/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source, boardId, accountId: accountId ?? undefined, title }),
        });
        const json = await res.json().catch(() => ({ success: false }));
        if (!res.ok || !json.success) {
          const code = json?.code as string | undefined;
          toast.error(code ? (CODE_MESSAGE[code] ?? "Kaydedilemedi.") : "Kaydedilemedi.");
          return;
        }
        const board = json.board as { id: string; name: string };
        const ref: SavedBoardRef = { boardId: board.id, boardName: board.name };
        setSaved((prev) => (prev.some((s) => s.boardId === ref.boardId) ? prev : [...prev, ref]));
        toast.success(json.alreadySaved ? `Zaten kayıtlı — ${board.name}` : `${board.name} panosuna kaydedildi`);
        onSaved?.({ ...ref, alreadySaved: Boolean(json.alreadySaved) });
        setOpen(false);
        setNewName("");
      } catch {
        toast.error("Bağlantı hatası — kaydedilemedi.");
      } finally {
        setSavingBoardId(null);
      }
    },
    [source, accountId, title, toast, onSaved],
  );

  const createAndSave = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setSavingBoardId("__new__");
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, accountId: accountId ?? undefined }),
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !json.success) {
        toast.error("Pano oluşturulamadı.");
        setSavingBoardId(null);
        return;
      }
      const board = json.board as BoardRow;
      setBoards((prev) => [...(prev ?? []), { id: board.id, name: board.name, accountId: board.accountId }]);
      await doSave(board.id, board.id);
    } catch {
      toast.error("Pano oluşturulamadı.");
      setSavingBoardId(null);
    }
  }, [newName, accountId, doSave, toast]);

  const hasSaved = saved.length > 0;
  const primaryLabel = hasSaved ? "Kayıtlı" : "Kaydet";
  const pad = size === "xs" ? "5px 9px" : "7px 12px";
  const fontSize = size === "xs" ? "var(--text-2xs)" : "var(--text-xs)";
  const iconSize = size === "xs" ? 13 : 14;

  return (
    <div style={{ display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="save-to-board"
        data-saved={hasSaved ? "true" : "false"}
        title={hasSaved ? `Kayıtlı: ${saved.map((s) => s.boardName).join(", ")}` : "Panoya kaydet"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: pad,
          borderRadius: "var(--radius-md)",
          border: `1px solid ${hasSaved ? "var(--accent-border)" : "var(--border)"}`,
          background: hasSaved ? "var(--accent-dark)" : "transparent",
          color: hasSaved ? "var(--accent-text)" : "var(--text-secondary)",
          fontSize,
          fontWeight: 500,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        {hasSaved ? <BookmarkCheck size={iconSize} strokeWidth={2} /> : <Bookmark size={iconSize} strokeWidth={2} />}
        {primaryLabel}
      </button>

      {open &&
        menuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Panoya kaydet"
            data-testid="save-board-menu"
            style={{
              position: "fixed",
              left: menuPos.left,
              ...(menuPos.top != null ? { top: menuPos.top } : { bottom: menuPos.bottom }),
              width: MENU_WIDTH,
              maxHeight: menuPos.maxHeight,
              overflowY: "auto",
              zIndex: 2000,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-lg)",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 4px" }}>
              Panoya kaydet
            </div>

            <button
              role="menuitem"
              type="button"
              onClick={() => doSave(undefined, "__default__")}
              disabled={savingBoardId !== null}
              style={menuItemStyle(false)}
            >
              {savingBoardId === "__default__" ? <Loader2 size={14} style={{ animation: "spin 0.6s linear infinite" }} /> : <Bookmark size={14} strokeWidth={2} />}
              <span style={{ flex: 1, textAlign: "left" }}>Hızlı kaydet (Kaydedilenler)</span>
            </button>

            <div style={{ height: 1, background: "var(--border-faint)", margin: "2px 0" }} />

            {loadingBoards ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                <Loader2 size={14} style={{ animation: "spin 0.6s linear infinite" }} /> Panolar yükleniyor…
              </div>
            ) : boardsFailed ? (
              <button role="menuitem" type="button" onClick={() => void loadBoards()} style={menuItemStyle(false)}>
                Panolar yüklenemedi — yeniden dene
              </button>
            ) : boards && boards.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {boards.map((b) => {
                  const already = isSavedTo(b.id);
                  return (
                    <button
                      key={b.id}
                      role="menuitem"
                      type="button"
                      onClick={() => (already ? undefined : doSave(b.id, b.id))}
                      disabled={savingBoardId !== null || already}
                      aria-current={already ? "true" : undefined}
                      style={menuItemStyle(already)}
                    >
                      {savingBoardId === b.id ? (
                        <Loader2 size={14} style={{ animation: "spin 0.6s linear infinite" }} />
                      ) : already ? (
                        <Check size={14} strokeWidth={2.4} color="var(--accent-text)" />
                      ) : (
                        <FolderPlus size={14} strokeWidth={2} />
                      )}
                      <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {b.name}
                        {b.accountId === null && <span style={{ color: "var(--text-muted)", fontSize: "var(--text-2xs)" }}> · ortak</span>}
                      </span>
                      {already && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>kayıtlı</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: "4px 4px", color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>Henüz pano yok.</div>
            )}

            <div style={{ height: 1, background: "var(--border-faint)", margin: "2px 0" }} />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void createAndSave();
              }}
              style={{ display: "flex", gap: 6, alignItems: "center" }}
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Yeni pano adı…"
                aria-label="Yeni pano adı"
                maxLength={120}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "7px 9px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "var(--text-xs)",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="submit"
                disabled={!newName.trim() || savingBoardId !== null}
                aria-label="Pano oluştur ve kaydet"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--accent-border)",
                  background: "var(--accent-dark)",
                  color: "var(--accent-text)",
                  cursor: newName.trim() ? "pointer" : "not-allowed",
                  opacity: newName.trim() ? 1 : 0.5,
                }}
              >
                {savingBoardId === "__new__" ? <Loader2 size={14} style={{ animation: "spin 0.6s linear infinite" }} /> : <Plus size={15} strokeWidth={2.2} />}
              </button>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}

function menuItemStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "7px 8px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid transparent",
    background: active ? "var(--accent-dark)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    fontSize: "var(--text-xs)",
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: active ? "default" : "pointer",
    textAlign: "left",
  };
}
