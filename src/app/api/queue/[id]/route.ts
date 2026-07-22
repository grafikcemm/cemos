import type { NextRequest } from "next/server";
import { z } from "zod";
import { queueRepo } from "@/lib/db/queueRepo";
import { runDeterministicHeuristics } from "@/lib/safety/heuristics";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

const updateSchema = z.object({
  editedContent: z.string().optional(),
  status: z.enum(["new", "approved", "scheduled", "published", "rejected", "failed"]).optional(),
  scheduledAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : v === null ? null : undefined)),
  lastError: z.string().optional().nullable(),
  approvedAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : v === null ? null : undefined)),
  lintReport: z.string().optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  try {
    const item = await queueRepo.findById(id);
    if (!item) return fail("Bulunamadı", 404);
    return ok({ item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = updateSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz istek", 400);
  }

  try {
    const existing = await queueRepo.findById(id);
    if (!existing) return fail("Bulunamadı", 404);

    const updateData = { ...parsed.data };

    if (typeof parsed.data.editedContent === "string") {
      const heuristicResult = runDeterministicHeuristics(
        parsed.data.editedContent,
        existing.draftType,
        280
      );
      const blockers = heuristicResult.issues
        .filter((i) => i.severity === "blocker")
        .map((i) => i.message);
      const warnings = heuristicResult.issues
        .filter((i) => i.severity === "warning")
        .map((i) => i.message);

      const lintReportObj = {
        passed: heuristicResult.passed,
        blockers,
        warnings,
        issues: heuristicResult.issues,
        cleanedText: null,
        checkedAt: new Date().toISOString(),
        source: {
          deterministic: true,
          llm: false,
        },
      };
      updateData.lintReport = JSON.stringify(lintReportObj);
    }

    const item = await queueRepo.update(id, updateData);
    return ok({ item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

import { scheduleService } from "@/lib/services/scheduleService";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  try {
    await scheduleService.deleteDraft(id);
    return ok();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
