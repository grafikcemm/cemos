import type { NextRequest } from "next/server";
import { z } from "zod";
import { ytChannelRepo } from "@/lib/db/ytChannelRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { isYouTubeConfigured, isYtCategory } from "@/lib/youtube/ytConfig";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

const PostSchema = z.object({
  channelId: z.string().min(1),
  action: z.string().optional(),
  category: z.string().optional(),
  enabled: z.boolean().optional(),
});

// GET /api/youtube/channels — rakipler + keşif onay kuyruğu.
export async function GET() {
  const [competitors, suggestions] = await Promise.all([
    ytChannelRepo.listAll(),
    ytChannelRepo.listSuggestions(),
  ]);
  return ok({
    configured: isYouTubeConfigured(),
    competitors,
    suggestions,
  });
}

// POST /api/youtube/channels — öneri onayla (enabled) ya da kategori düzelt.
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PostSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  const { channelId, action, category, enabled } = parsed.data;
  try {
    if (action === "setCategory") {
      if (typeof category !== "string" || !isYtCategory(category)) {
        return fail("Geçersiz kategori", 400);
      }
      const channel = await ytChannelRepo.updateCategory(channelId, category);
      return ok({ channel });
    }
    const channel = await ytChannelRepo.setEnabled(channelId, typeof enabled === "boolean" ? enabled : true);
    return ok({ channel });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
