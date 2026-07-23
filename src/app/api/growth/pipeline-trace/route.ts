import type { NextRequest } from "next/server";
import { z } from "zod";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  subjectType: z.string().min(1, "subjectType required"),
  subjectId: z.string().min(1, "subjectId required"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Neon serverless can drop the first connection on cold start — retry once.
async function withRetryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return fn();
  }
}

export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("unauthorized", 403);
  const parsed = QuerySchema.safeParse({
    subjectType: req.nextUrl.searchParams.get("subjectType") ?? "",
    subjectId: req.nextUrl.searchParams.get("subjectId") ?? "",
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return fail(`Geçersiz istek: ${parsed.error.issues.map((i) => i.message).join(", ")}`, 400);
  }

  try {
    const traces = await withRetryOnce(() =>
      pipelineTraceRepo.listBySubject(parsed.data.subjectType, parsed.data.subjectId, parsed.data.limit ?? 20)
    );
    return ok({ traces });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const message = err instanceof Error ? err.message : "Beklenmeyen hata";
    return fail(message, 500);
  }
}
