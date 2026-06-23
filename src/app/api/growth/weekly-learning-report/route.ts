import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { WeeklyLearningReportInputSchema } from "@/lib/growth-engine/types";
import { generateWeeklyLearningReport } from "@/lib/growth-engine/weekly-learning-report";
import { fail } from "@/lib/utils/apiResponse";

// Neon's pooler drops cold connections; the first request after idle can fail
// with a transient connectivity error. One short retry absorbs that.
const TRANSIENT_DB_ERROR = /can't reach database|connection|ECONNRESET|ETIMEDOUT|closed/i;
const RETRY_DELAY_MS = 400;

async function withRetryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!TRANSIENT_DB_ERROR.test(msg)) throw err;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fn();
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const accountHandle = searchParams.get("accountHandle") || "all";
    const dateRange = searchParams.get("dateRange") || "last_7_days";
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    // 1. Zod parameter validation
    const parsedInput = WeeklyLearningReportInputSchema.safeParse({
      accountHandle,
      dateRange,
      from,
      to,
    });

    if (!parsedInput.success) {
      const errors = parsedInput.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      return fail(`Validation Error: ${errors}`, 400);
    }

    // 2. Generate report (one retry on transient DB connectivity errors)
    const report = await withRetryOnce(() => generateWeeklyLearningReport(parsedInput.data));

    return NextResponse.json(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error compiling weekly learning report.";
    return fail(msg, 500);
  }
}
