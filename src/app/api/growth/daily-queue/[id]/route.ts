import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { queueRepo } from "@/lib/db/queueRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";
import {
  isThreadDraft,
  joinThreadSegments,
  normalizeThreadSegments,
  parseThreadSegments,
  serializeThreadSegments,
  THREAD_SCHEMA_MAX_SEGMENTS,
} from "@/lib/growth-engine/threadSegments";

const UpdateQueueItemSchema = z.object({
  content: z.string().max(10000).optional(),
  status: z.string().max(50).optional(),
  scheduledAt: z.union([z.string(), z.null()]).optional(),
  // Faz 1C: yapısal thread segmentleri (JSON string: ThreadSegment[]); null = temizle.
  threadSegments: z.union([z.string().max(40000), z.null()]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);

    const parsed = UpdateQueueItemSchema.safeParse(body.data);
    if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

    const { content, status, scheduledAt, threadSegments } = parsed.data;

    // 1. Fetch existing item
    const existing = await queueRepo.findById(id);
    if (!existing) {
      return fail("Queue item not found", 404);
    }

    // 2. Prevent changing if already published
    if (existing.status === "published" || existing.status === "manual_published") {
      return fail("Cannot modify already published items.", 400);
    }

    const updates: any = {};

    // 3. Validate content
    if (content !== undefined) {
      if (typeof content !== "string" || content.trim().length === 0) {
        return fail("Content cannot be empty.", 400);
      }
      updates.content = content.trim();
    }

    // 3b. Yapısal thread segmentleri (Zod-doğrulanmış; null = temizle, fail-closed).
    //     Phase 2D (ADR-033): boş segment REDDEDİLİR (sessiz temizlik yok); şema
    //     tavanı uygulanır; thread taslağında segmentler ile güncel birleşik
    //     metin (editedContent) AYNI update içinde senkron tutulur — generated
    //     original `content` korunur, kullanıcı düzenlemesi editedContent'e yazılır.
    if (threadSegments !== undefined) {
      if (threadSegments === null) {
        updates.threadSegments = null;
      } else {
        const segs = parseThreadSegments(threadSegments);
        if (!segs) return fail("Geçersiz thread segmentleri.", 400);
        if (segs.some((s) => s.text.trim().length === 0)) {
          return fail("Boş segment kaydedilemez — segmenti doldur veya sil.", 400);
        }
        if (segs.length > THREAD_SCHEMA_MAX_SEGMENTS) {
          return fail(`En fazla ${THREAD_SCHEMA_MAX_SEGMENTS} segment kaydedilebilir.`, 400);
        }
        const normalized = normalizeThreadSegments(segs)!;
        updates.threadSegments = serializeThreadSegments(normalized);
        if (isThreadDraft(existing.draftType, existing.mode)) {
          updates.editedContent = joinThreadSegments(normalized);
        }
      }
    }

    // 4. Validate scheduledAt date
    if (scheduledAt !== undefined) {
      if (scheduledAt === null) {
        updates.scheduledAt = null;
      } else {
        const parsedDate = new Date(scheduledAt);
        if (isNaN(parsedDate.getTime())) {
          return fail("Invalid scheduled date.", 400);
        }
        if (parsedDate.getTime() < Date.now() - 5000) { // allow 5s buffer
          return fail("Scheduled date cannot be in the past.", 400);
        }
        updates.scheduledAt = parsedDate;
      }
    }

    // 5. Validate status and map draft to new
    if (status !== undefined) {
      if (status === "manual_published") {
        // Faz 1E (ADR-025): doğrudan yayın-state yazımı YOK — state machine'e
        // yönlendir. prepared intent attempt yoksa 422 (hazırlık bulunamadı);
        // içerik değiştiyse contentHash eşleşmez → 422 (yeniden X'te aç).
        if (Object.keys(updates).length > 0) {
          await queueRepo.update(id, updates);
        }
        const { publishAttemptService } = await import("@/lib/publish/publishAttemptService");
        const publishedResult = await publishAttemptService.confirmManualPublish(id);
        return ok({
          item: publishedResult.item,
          alreadyPublished: publishedResult.alreadyPublished,
        });
      }

      if (!["draft", "approved", "rejected", "scheduled"].includes(status)) {
        return fail(`Invalid status: ${status}`, 400);
      }
      if (status === "scheduled" && !updates.scheduledAt && !existing.scheduledAt) {
        return fail("Scheduled status requires a future scheduledAt date.", 400);
      }
      updates.status = status === "draft" ? "new" : status;
    }

    const updatedItem = await queueRepo.update(id, updates);

    return ok({
      item: updatedItem,
    });
  } catch (err) {
    // Faz 1E: typed publish state machine hataları (PublishFlowError) Türkçe,
    // eyleme dönük mesaja çevrilir (prepare_not_found/content_changed/... dahil).
    const { PublishFlowError } = await import("@/lib/publish/contract");
    if (err instanceof PublishFlowError) {
      const { publishErrorResponse } = await import("@/lib/publish/routeErrors");
      const { status: httpStatus, error, code, reasons } = publishErrorResponse(err);
      return fail(error, httpStatus, { code, reasons });
    }
    const msg = err instanceof Error ? err.message : "Unexpected system error during daily queue update.";
    if (msg === "invalid_status") return fail("Durum geçersiz.", 409, { code: msg });
    if (msg === "queue_item_not_found") return fail("Taslak bulunamadı.", 404, { code: msg });
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    return fail(msg, 500);
  }
}
