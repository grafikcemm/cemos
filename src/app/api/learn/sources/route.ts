import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  learnService,
  InvalidSourceUrlError,
  InvalidSourceInputError,
  type SourceIntake,
} from "@/lib/learning/learnService";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

function disabled() {
  return fail("disabled", 404, { code: "disabled" });
}

// 4C-A intake DTO'ları — İSTEMCİ provider/trust/verified BELİRLEYEMEZ (yalnız içerik alanları).
const YoutubeSchema = z.object({
  kind: z.literal("youtube"),
  url: z.string().trim().min(1),
  manualTranscript: z.string().max(500_000).optional(),
});
const ManualSchema = z.object({
  kind: z.literal("manual_transcript"),
  text: z.string().min(1).max(500_000),
  title: z.string().max(300).optional(),
});
const NotebookSchema = z.object({
  kind: z.literal("notebooklm_summary"),
  summary: z.string().min(1).max(500_000),
  title: z.string().max(300).optional(),
  sourceUrl: z.string().max(2000).optional(),
});
const PostSchema = z.discriminatedUnion("kind", [YoutubeSchema, ManualSchema, NotebookSchema]);

/** Legacy gövde ({url} kind'sız) → youtube (geriye uyum). */
function withDefaultKind(raw: unknown): unknown {
  if (raw && typeof raw === "object" && !("kind" in raw) && "url" in raw) {
    return { ...(raw as Record<string, unknown>), kind: "youtube" };
  }
  return raw;
}

// GET /api/learn/sources — dashboard (kaynaklar + sayaçlar).
export async function GET() {
  if (!isLearnEnabled()) return disabled();
  const data = await learnService.dashboard();
  return ok({ ...data });
}

// POST /api/learn/sources — kaynak + işleme job'ı yaratır (youtube | manual_transcript | notebooklm_summary).
export async function POST(req: NextRequest) {
  if (!isLearnEnabled()) return disabled();
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PostSchema.safeParse(withDefaultKind(body.data));
  if (!parsed.success) {
    return fail("Geçersiz kaynak girdisi", 400, { detail: parsed.error.flatten() });
  }
  try {
    const result = await learnService.createSource(parsed.data as SourceIntake);
    return ok({ ...result });
  } catch (err) {
    if (err instanceof InvalidSourceUrlError) {
      return fail(err.message, 400, { code: "invalid_url" });
    }
    if (err instanceof InvalidSourceInputError) {
      return fail(err.message, 400, { code: "invalid_input" });
    }
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg, 500);
  }
}
