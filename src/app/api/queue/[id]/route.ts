import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queueRepo } from "@/lib/db/queueRepo";
import { runDeterministicHeuristics } from "@/lib/safety/heuristics";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

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
  ctx: RouteContext<"/api/queue/[id]">
) {
  const { id } = await ctx.params;
  try {
    const item = await queueRepo.findById(id);
    if (!item) return NextResponse.json({ success: false, error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json({ success: true, item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/queue/[id]">
) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Geçersiz istek" }, { status: 400 });
  }

  try {
    const existing = await queueRepo.findById(id);
    if (!existing) return NextResponse.json({ success: false, error: "Bulunamadı" }, { status: 404 });

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
    return NextResponse.json({ success: true, item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

import { scheduleService } from "@/lib/services/scheduleService";

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/queue/[id]">
) {
  const { id } = await ctx.params;
  try {
    await scheduleService.deleteDraft(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
