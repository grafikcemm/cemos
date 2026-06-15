import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { queueRepo } from "@/lib/db/queueRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json();

    const { content, status, scheduledAt } = body;

    // 1. Fetch existing item
    const existing = await queueRepo.findById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Queue item not found" }, { status: 404 });
    }

    // 2. Prevent changing if already published
    if (existing.status === "published" || existing.status === "manual_published") {
      return NextResponse.json(
        { success: false, error: "Cannot modify already published items." },
        { status: 400 }
      );
    }

    const updates: any = {};

    // 3. Validate content
    if (content !== undefined) {
      if (typeof content !== "string" || content.trim().length === 0) {
        return NextResponse.json({ success: false, error: "Content cannot be empty." }, { status: 400 });
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
          return NextResponse.json({ success: false, error: "Invalid scheduled date." }, { status: 400 });
        }
        if (parsedDate.getTime() < Date.now() - 5000) { // allow 5s buffer
          return NextResponse.json(
            { success: false, error: "Scheduled date cannot be in the past." },
            { status: 400 }
          );
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
        return NextResponse.json({
          success: true,
          item: publishedResult.item,
        });
      }

      if (!["draft", "approved", "rejected", "scheduled"].includes(status)) {
        return NextResponse.json({ success: false, error: `Invalid status: ${status}` }, { status: 400 });
      }
      if (status === "scheduled" && !updates.scheduledAt && !existing.scheduledAt) {
        return NextResponse.json(
          { success: false, error: "Scheduled status requires a future scheduledAt date." },
          { status: 400 }
        );
      }
      updates.status = status === "draft" ? "new" : status;
    }

    const updatedItem = await queueRepo.update(id, updates);

    return NextResponse.json({
      success: true,
      item: updatedItem,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error during daily queue update.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
