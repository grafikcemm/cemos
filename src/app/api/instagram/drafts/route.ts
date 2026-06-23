import type { NextRequest } from "next/server";
import { instagramService } from "@/lib/services/instagramService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/instagram/drafts { bulk:true } — öncelikli (≥60) yorumlara toplu taslak (guard)
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const result = await instagramService.generateReplyDrafts({ bulk: true });
    return ok({ generated: result.generated });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "error";
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg, code === "budget" ? 402 : 500, { code });
  }
}
