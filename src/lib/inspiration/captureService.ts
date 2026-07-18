import { z } from "zod";
import { prisma } from "@/lib/db/client";
import type { Board, BoardItem, ContentItem, Prisma } from "@/generated/prisma/client";
import { canonicalizeInstagramUrl } from "@/lib/inspiration/instagramUrl";
import {
  INSPIRATION_META_SCHEMA_VERSION,
  InspirationFormatSchema,
  InspirationMetaSchema,
  parseInspirationMeta,
  serializeInspirationMeta,
  type InspirationMeta,
} from "@/lib/inspiration/inspirationMeta";

/**
 * İlham yakalama servisi (Phase 3C §A) — account-scoped + ATOMİK + idempotent.
 *
 * Sözleşme:
 *  - Aktif accountId ZORUNLU; board sahipliği doğrulanır; cross-account ve
 *    paylaşılan (accountId=null) board'a capture FAIL-CLOSED reddedilir.
 *  - URL fetch EDİLMEZ, scraping YOK — yalnız canonicalization + kayıt.
 *  - ContentItem upsert + BoardItem ekleme TEK transaction'da; başarısız
 *    transaction orphan ContentItem bırakmaz.
 *  - Idempotency: transaction içi advisory lock (Phase 3B deseni) + mevcut
 *    (board, contentItem) satırının güncellenmesi — çift tık/retry duplicate
 *    BoardItem üretmez (BoardItem'da unique index yok; kilit yarışı kapatır).
 *  - Manuel metrikler YALNIZ meta zarfında `operator_observed` provenance ile
 *    yaşar; ContentItem.metricsJson'a YAZILMAZ (provider metriğiyle karışmaz,
 *    baseline/outlier hesabına giremez).
 */

export const DEFAULT_INSPIRATION_BOARD_NAME = "Instagram İlham";

const HandleSchema = z
  .string()
  .max(60)
  .transform((s) => s.replace(/^@/, "").trim().toLowerCase())
  .refine((s) => s === "" || /^[a-z0-9._]{1,30}$/.test(s), {
    message: "Geçersiz Instagram kullanıcı adı",
  });

export const ManualMetricsInputSchema = z.object({
  likes: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  views: z.number().int().min(0).optional(),
  saves: z.number().int().min(0).optional(),
  shares: z.number().int().min(0).optional(),
  /** Operatörün metrikleri gördüğü tarih; verilmezse capture anı. */
  observedAt: z.string().datetime().optional(),
});

export const CaptureInspirationSchema = z.object({
  accountId: z.string().min(1).max(64),
  boardId: z.string().min(1).max(64).optional(),
  url: z.string().min(1).max(2_000),
  title: z.string().max(200).optional(),
  format: InspirationFormatSchema.optional(),
  creatorHandle: HandleSchema.optional(),
  caption: z.string().max(10_000).optional(),
  transcript: z.string().max(20_000).optional(),
  note: z.string().max(5_000).optional(),
  manualMetrics: ManualMetricsInputSchema.optional(),
});
export type CaptureInspirationInput = z.infer<typeof CaptureInspirationSchema>;

export type CaptureFailureCode =
  | "invalid_url"
  | "account_not_found"
  | "board_not_found"
  | "board_not_owned"
  | "board_archived";

export type CaptureResult =
  | {
      ok: true;
      created: boolean;
      board: Board;
      boardItem: BoardItem;
      contentItem: ContentItem;
      meta: InspirationMeta;
    }
  | { ok: false; code: CaptureFailureCode; message: string };

type Tx = Prisma.TransactionClient;

/** Hesaba ait varsayılan Instagram ilham panosunu idempotent döndürür/oluşturur. */
export async function ensureInspirationBoard(accountId: string): Promise<Board> {
  const existing = await prisma.board.findFirst({
    where: { name: DEFAULT_INSPIRATION_BOARD_NAME, accountId, archivedAt: null },
  });
  if (existing) return existing;
  return prisma.board.create({
    data: { name: DEFAULT_INSPIRATION_BOARD_NAME, accountId, icon: "sparkles" },
  });
}

function mergeMeta(existing: InspirationMeta | null, incoming: InspirationMeta): InspirationMeta {
  if (!existing) return incoming;
  // Yeniden capture: yeni verilen alanlar kazanır; verilmeyenler korunur.
  return InspirationMetaSchema.parse({
    ...existing,
    format: incoming.formatSource === "operator" || existing.format === "unknown" ? incoming.format : existing.format,
    formatSource:
      incoming.formatSource === "operator" || existing.format === "unknown"
        ? incoming.formatSource
        : existing.formatSource,
    creatorHandle: incoming.creatorHandle || existing.creatorHandle,
    caption: incoming.caption || existing.caption,
    transcript: incoming.transcript || existing.transcript,
    manualMetrics: incoming.manualMetrics ?? existing.manualMetrics,
    capturedAt: existing.capturedAt,
    // Mevcut deterministik analiz KORUNUR — yeniden analiz açık kullanıcı eylemi.
    analysis: existing.analysis,
  });
}

async function upsertManualContentItem(
  tx: Tx,
  input: {
    externalId: string;
    canonicalUrl: string;
    format: string;
    caption: string;
    transcript: string;
    handle: string;
    title: string;
  },
): Promise<ContentItem> {
  const existing = await tx.contentItem.findUnique({
    where: { platform_externalId: { platform: "instagram", externalId: input.externalId } },
  });
  if (!existing) {
    return tx.contentItem.create({
      data: {
        platform: "instagram",
        externalId: input.externalId,
        canonicalUrl: input.canonicalUrl,
        sourceType: "manual",
        contentType: "post",
        format: input.format,
        title: input.title,
        body: input.caption,
        transcript: input.transcript,
        author: input.handle,
        // Manuel metrik BURAYA yazılmaz — provider metriğiyle karışmaz.
        metricsJson: "{}",
      },
    });
  }
  // Var olan satır (önceki manuel capture): yalnız dolu gelen alanlar tazelenir;
  // provider kaynaklı satıra (sourceType external) manuel yazım format/metrics'i bozmaz.
  const data: Prisma.ContentItemUpdateInput = {};
  if (input.caption && existing.sourceType === "manual") data.body = input.caption;
  if (input.transcript && existing.sourceType === "manual") data.transcript = input.transcript;
  if (input.title && existing.sourceType === "manual") data.title = input.title;
  if (input.handle && !existing.author) data.author = input.handle;
  if (existing.sourceType === "manual" && input.format !== "unknown" && existing.format !== input.format) {
    data.format = input.format;
  }
  if (Object.keys(data).length === 0) return existing;
  return tx.contentItem.update({ where: { id: existing.id }, data });
}

export async function captureInspiration(rawInput: unknown): Promise<CaptureResult> {
  const input = CaptureInspirationSchema.parse(rawInput);

  const account = await prisma.account.findUnique({ where: { id: input.accountId } });
  if (!account) {
    return { ok: false, code: "account_not_found", message: "Hesap bulunamadı — aktif hesap seç." };
  }

  const canonical = canonicalizeInstagramUrl(input.url);
  if (!canonical.ok) {
    return { ok: false, code: "invalid_url", message: canonical.message };
  }

  let board: Board;
  if (input.boardId) {
    const found = await prisma.board.findUnique({ where: { id: input.boardId } });
    if (!found) return { ok: false, code: "board_not_found", message: "Pano bulunamadı." };
    if (found.archivedAt) return { ok: false, code: "board_archived", message: "Pano arşivlenmiş." };
    if (found.accountId === null) {
      return {
        ok: false,
        code: "board_not_owned",
        message: "Paylaşılan (hesapsız) panoya ilham kaydı kapalı — hesabına ait bir pano seç.",
      };
    }
    if (found.accountId !== input.accountId) {
      // Cross-account fail-closed: başka hesabın panosu sızdırılmaz.
      return { ok: false, code: "board_not_owned", message: "Bu pano aktif hesaba ait değil." };
    }
    board = found;
  } else {
    board = await ensureInspirationBoard(input.accountId);
  }

  const now = new Date().toISOString();
  const format = input.format ?? canonical.formatHint;
  const meta: InspirationMeta = InspirationMetaSchema.parse({
    schemaVersion: INSPIRATION_META_SCHEMA_VERSION,
    kind: "inspiration_capture",
    format,
    formatSource: input.format ? "operator" : canonical.formatHint === "unknown" ? "unknown" : "url_hint",
    creatorHandle: input.creatorHandle ?? "",
    caption: input.caption ?? "",
    transcript: input.transcript ?? "",
    manualMetrics: input.manualMetrics
      ? {
          provenance: "operator_observed",
          observedAt: input.manualMetrics.observedAt ?? now,
          ...(input.manualMetrics.likes !== undefined ? { likes: input.manualMetrics.likes } : {}),
          ...(input.manualMetrics.comments !== undefined ? { comments: input.manualMetrics.comments } : {}),
          ...(input.manualMetrics.views !== undefined ? { views: input.manualMetrics.views } : {}),
          ...(input.manualMetrics.saves !== undefined ? { saves: input.manualMetrics.saves } : {}),
          ...(input.manualMetrics.shares !== undefined ? { shares: input.manualMetrics.shares } : {}),
        }
      : null,
    capturedAt: now,
    analysis: null,
  });

  const result = await prisma.$transaction(async (tx) => {
    // Aynı (board, gönderi) için eşzamanlı çift tıkı serileştir (Phase 3B deseni).
    const lockKey = `inspiration:${board.id}:${canonical.externalId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const contentItem = await upsertManualContentItem(tx, {
      externalId: canonical.externalId,
      canonicalUrl: canonical.canonicalUrl,
      format,
      caption: input.caption ?? "",
      transcript: input.transcript ?? "",
      handle: input.creatorHandle ?? "",
      title: input.title ?? "",
    });

    // Creator bağlantısı (opsiyonel; görüntüleme değeri). Baseline'lar manuel
    // içerikleri DIŞLAR (recomputeBaseline sourceType filtresi) — kirlenme yok.
    if (input.creatorHandle && !contentItem.creatorId) {
      const creator = await tx.creator.upsert({
        where: { platform_handle: { platform: "instagram", handle: input.creatorHandle } },
        create: { platform: "instagram", handle: input.creatorHandle },
        update: {},
      });
      await tx.contentItem.update({ where: { id: contentItem.id }, data: { creatorId: creator.id } });
    }

    const existingItem = await tx.boardItem.findFirst({
      where: { boardId: board.id, contentItemId: contentItem.id },
    });
    if (existingItem) {
      const merged = mergeMeta(parseInspirationMeta(existingItem.metaJson), meta);
      const updated = await tx.boardItem.update({
        where: { id: existingItem.id },
        data: {
          metaJson: serializeInspirationMeta(merged),
          ...(input.note ? { note: input.note } : {}),
          ...(input.title ? { title: input.title } : {}),
        },
      });
      return { boardItem: updated, contentItem, created: false, meta: merged };
    }

    const boardItem = await tx.boardItem.create({
      data: {
        boardId: board.id,
        contentItemId: contentItem.id,
        itemType: "content",
        title: input.title ?? "",
        url: canonical.canonicalUrl,
        note: input.note ?? "",
        metaJson: serializeInspirationMeta(meta),
      },
    });
    return { boardItem, contentItem, created: true, meta };
  });

  return { ok: true, board, ...result };
}
