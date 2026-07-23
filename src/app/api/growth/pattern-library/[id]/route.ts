import type { NextRequest } from "next/server";
import { z } from "zod";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

const UpdatePatternSchema = z.object({
  patternName: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  hookType: z.string().max(100).optional(),
  structureJson: z.union([z.string(), z.record(z.any())]).optional(),
  emotion: z.string().max(200).optional(),
  viralityTrigger: z.string().max(500).optional(),
  exampleGood: z.string().max(5000).optional(),
  exampleBad: z.string().max(5000).optional(),
  successScore: z.number().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;
    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) return fail("Geçersiz JSON", 400);

    const parsed = UpdatePatternSchema.safeParse(parsedBody.data);
    if (!parsed.success) return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });

    const body: Record<string, any> = { ...parsed.data };

    // 1. Validate patternName is non-empty
    if (body.patternName !== undefined && body.patternName.trim() === "") {
      return fail("Pattern name cannot be empty", 400);
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
          return fail("Invalid structure JSON format", 400);
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

    return ok({
      pattern: updated,
    });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return fail(msg, 500);
  }
}
