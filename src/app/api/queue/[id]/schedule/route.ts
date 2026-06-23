import type { NextRequest } from "next/server";
import { z } from "zod";
import { scheduleService } from "@/lib/services/scheduleService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

const ScheduleSchema = z.object({
  slotKey: z.string().optional(),
  scheduledAt: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/queue/[id]">
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = ScheduleSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }

  try {
    if (parsed.data.slotKey) {
      const item = await scheduleService.quickSlot(id, parsed.data.slotKey);
      return ok({ item });
    }

    if (parsed.data.scheduledAt) {
      const scheduledAt = new Date(parsed.data.scheduledAt);
      if (isNaN(scheduledAt.getTime())) {
        return fail("Geçersiz tarih formatı", 400);
      }
      const item = await scheduleService.scheduleDraft(id, scheduledAt);
      return ok({ item });
    }

    return fail("scheduledAt veya slotKey gerekli", 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 400);
  }
}
