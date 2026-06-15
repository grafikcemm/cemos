import { NextRequest, NextResponse } from "next/server";
import { buildMemoryContext, buildMemoryPromptBlock } from "@/lib/growth-engine/vector-memory";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { validateAccountHandle } from "@/lib/growth-engine/account-profiles";
import { z } from "zod";

const Schema = z
  .object({
    accountHandle: z.enum(["grafikcem", "maskulenkod"]),
    sourceContent: z.string().optional(),
    manualIdea: z.string().optional(),
    draftContent: z.string().optional(),
    limitPerGroup: z.number().int().min(1).optional()
  })
  .refine(
    (data) => {
      return Boolean(
        data.sourceContent?.trim() ||
        data.manualIdea?.trim() ||
        data.draftContent?.trim()
      );
    },
    {
      message: "At least one content field (sourceContent, manualIdea, or draftContent) must be non-empty",
      path: ["sourceContent"]
    }
  );

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const result = Schema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Validation error: missing content fields or invalid types" },
        { status: 400 }
      );
    }

    const { accountHandle, sourceContent, manualIdea, draftContent, limitPerGroup } = result.data;
    if (!validateAccountHandle(accountHandle)) {
      return NextResponse.json(
        { success: false, error: "Invalid accountHandle" },
        { status: 400 }
      );
    }

    const memoryContext = await buildMemoryContext({
      accountHandle,
      sourceContent,
      manualIdea,
      draftContent,
      limitPerGroup
    });

    const promptBlock = buildMemoryPromptBlock(memoryContext);

    return NextResponse.json({
      success: true,
      memoryContext,
      promptBlock
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
