import { NextRequest, NextResponse } from "next/server";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
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

    // 1. Validate patternName is non-empty
    if (body.patternName !== undefined && body.patternName.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Pattern name cannot be empty" },
        { status: 400 }
      );
    }

    // 2. Clamp successScore to 0-100
    if (body.successScore !== undefined) {
      body.successScore = Math.max(0, Math.min(100, Math.round(Number(body.successScore))));
    }

    // 3. Parse structureJson safely if passed as string
    let structureJsonObj: Record<string, any> | undefined = undefined;
    if (body.structureJson !== undefined) {
      if (typeof body.structureJson === "string") {
        try {
          structureJsonObj = JSON.parse(body.structureJson);
        } catch {
          return NextResponse.json(
            { success: false, error: "Invalid structure JSON format" },
            { status: 400 }
          );
        }
      } else if (body.structureJson && typeof body.structureJson === "object") {
        structureJsonObj = body.structureJson;
      }
    }

    // 4. Build updates input
    const updates: any = {};
    if (body.patternName !== undefined) updates.patternName = body.patternName;
    if (body.category !== undefined) updates.category = body.category;
    if (body.hookType !== undefined) updates.hookType = body.hookType;
    if (structureJsonObj !== undefined) updates.structureJson = structureJsonObj;
    if (body.emotion !== undefined) updates.emotion = body.emotion;
    if (body.viralityTrigger !== undefined) updates.viralityTrigger = body.viralityTrigger;
    if (body.exampleGood !== undefined) updates.exampleGood = body.exampleGood;
    if (body.exampleBad !== undefined) updates.exampleBad = body.exampleBad;
    if (body.successScore !== undefined) updates.successScore = body.successScore;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    // 5. Update database
    const updated = await viralPatternRepo.update(id, updates);

    return NextResponse.json({
      success: true,
      pattern: updated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
