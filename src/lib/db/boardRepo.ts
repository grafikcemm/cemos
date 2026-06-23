import { prisma } from "@/lib/db/client";
import type { Board, BoardItem } from "@/generated/prisma/client";

// Boards / Swipe-file deposu. Kütüphane'nin store-only savedTweets'ini kalıcı,
// kanonik ContentItem'a bağlı board yapısına taşır (Space→Board→Section→Item).
// Hesap-kapsamlı plain accountId (FK yok; null = paylaşılan board).

const DEFAULT_SAVED_BOARD = "Kaydedilenler";

export const boardRepo = {
  list(accountId?: string): Promise<Board[]> {
    return prisma.board.findMany({
      where: { archivedAt: null, ...(accountId ? { accountId } : {}) },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  },

  getById(id: string): Promise<Board | null> {
    return prisma.board.findUnique({ where: { id } });
  },

  create(input: {
    name: string;
    accountId?: string | null;
    description?: string;
    icon?: string;
  }): Promise<Board> {
    return prisma.board.create({
      data: {
        name: input.name,
        accountId: input.accountId ?? null,
        description: input.description ?? "",
        icon: input.icon ?? "",
      },
    });
  },

  withItems(id: string) {
    return prisma.board.findUnique({
      where: { id },
      include: {
        sections: { orderBy: { position: "asc" } },
        items: { orderBy: { position: "asc" }, include: { contentItem: true } },
      },
    });
  },

  /** Varsayılan "Kaydedilenler" board'ını döndürür/oluşturur (hesap başına). */
  async ensureDefaultBoard(accountId?: string | null): Promise<Board> {
    const existing = await prisma.board.findFirst({
      where: { name: DEFAULT_SAVED_BOARD, accountId: accountId ?? null },
    });
    if (existing) return existing;
    return prisma.board.create({
      data: { name: DEFAULT_SAVED_BOARD, accountId: accountId ?? null, icon: "bookmark" },
    });
  },

  /** Board'a birim ekler (kanonik içerik veya serbest url/not). */
  addItem(input: {
    boardId: string;
    contentItemId?: string;
    sectionId?: string;
    itemType?: string;
    title?: string;
    url?: string;
    note?: string;
  }): Promise<BoardItem> {
    return prisma.boardItem.create({
      data: {
        boardId: input.boardId,
        sectionId: input.sectionId ?? null,
        contentItemId: input.contentItemId ?? null,
        itemType: input.itemType ?? (input.contentItemId ? "content" : "url"),
        title: input.title ?? "",
        url: input.url ?? "",
        note: input.note ?? "",
      },
    });
  },

  removeItem(id: string): Promise<BoardItem> {
    return prisma.boardItem.delete({ where: { id } });
  },
};
