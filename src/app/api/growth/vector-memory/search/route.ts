import { NextRequest, NextResponse } from "next/server";
import { searchSimilarExamples } from "@/lib/growth-engine/vector-memory";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { validateAccountHandle } from "@/lib/growth-engine/account-profiles";
import { z } from "zod";

const Schema = z.object({
  accountHandle: z.enum(["grafikcem", "maskulenkod"]),
  text: z.string().min(1, "text is required"),
  label: z.enum(["positive", "negative", "edited", "pattern", "unknown"]).optional(),
  limit: z.number().int().min(1).optional()
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const result = Schema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Validation error: invalid request fields" },
        { status: 400 }
      );
    }

    const { accountHandle, text, label, limit } = result.data;
    if (!validateAccountHandle(accountHandle)) {
      return NextResponse.json(
        { success: false, error: "Invalid accountHandle" },
        { status: 400 }
      );
    }

    const results = await searchSimilarExamples({
      accountHandle,
      text,
      label,
      limit
    });

    return NextResponse.json({
      success: true,
      results
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
