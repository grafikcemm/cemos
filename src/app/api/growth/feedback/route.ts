import { NextRequest, NextResponse } from "next/server";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { ZodError } from "zod";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const result = await processFeedback(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: err.errors,
        },
        { status: 400 }
      );
    }

    const message = err instanceof Error ? err.message : "Unexpected system error";
    
    // Check for explicit input validation issues that warrant 400 Bad Request
    if (
      message.includes("Invalid accountHandle") ||
      message.includes("No content provided")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
