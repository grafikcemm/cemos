import type { NextRequest } from "next/server";
import { z } from "zod";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { setModelProfile } from "@/lib/services/settingsService";

const ProfileSchema = z.object({
  profile: z.enum(["dev", "operator_quality", "premium"]),
});

/**
 * Durable, server-authoritative model-profile write (Phase 5F §6).
 *
 * The previous implementation wrote `.env.local` via fs, which on Vercel is a
 * read-only FS outside /tmp (throws) and is never re-read per request (a mutated
 * `process.env` touches only the current ephemeral instance and is lost on cold
 * start). The UI reported success while production routing never changed.
 *
 * Now persisted in `OperatorSetting`; success is returned ONLY after the row is
 * committed. `instrumentation.register()` re-hydrates `process.env.MODEL_PROFILE`
 * on each instance boot so the synchronous resolver honors the durable choice.
 */
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = ProfileSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz profil değeri.", 400, { detail: parsed.error.flatten() });
  }
  try {
    const profile = await setModelProfile(parsed.data.profile);
    return ok({ profile, durable: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model profili güncellenemedi";
    return fail(message, 500);
  }
}
