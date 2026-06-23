import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { queueRepo } from "@/lib/db/queueRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

const UpdateQueueItemSchema = z.object({
  content: z.string().max(10000).optional(),
  status: z.string().max(50).optional(),
  scheduledAt: z.union([z.string(), z.null()]).optional(),
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

    const { content, status, scheduledAt } = parsed.data;

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
        if (Object.keys(updates).length > 0) {
          await queueRepo.update(id, updates);
        }
        const { publishService } = await import("@/lib/services/publishService");
        const publishedResult = await publishService.markManualPublished(id);
        return ok({
          item: publishedResult.item,
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
    const msg = err instanceof Error ? err.message : "Unexpected system error during daily queue update.";
    return fail(msg, 500);
  }
}
