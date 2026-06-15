import { NextRequest, NextResponse } from "next/server";
import { embedTrainingExample } from "@/lib/growth-engine/vector-memory";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { z } from "zod";

const Schema = z.object({
  exampleId: z.string().min(1, "exampleId is required"),
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
        { success: false, error: "Validation error", details: result.error.format() },
        { status: 400 }
      );
    }

    const { exampleId } = result.data;
    const embedding = await embedTrainingExample(exampleId);

    return NextResponse.json({
      success: true,
      embedding: {
        provider: embedding.provider,
        model: embedding.model,
        dimensions: embedding.dimensions,
        createdAt: embedding.createdAt,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: msg.includes("not found") ? 404 : 500 }
    );
  }
}
