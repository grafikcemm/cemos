import { NextRequest } from "next/server";
import { z } from "zod";
import { contentItemRepo } from "@/lib/db/contentItemRepo";
import { ingestContent } from "@/lib/content/ingestService";
import { fromManualUrl } from "@/lib/content/normalizer";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/content?platform=&format=&analysisStatus=&limit=
// Lists canonical content items (Eden unified content pool).
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const sp = req.nextUrl.searchParams;
  try {
    const items = await contentItemRepo.list({
      platform: sp.get("platform") ?? undefined,
      format: sp.get("format") ?? undefined,
      analysisStatus: sp.get("analysisStatus") ?? undefined,
      creatorId: sp.get("creatorId") ?? undefined,
      limit: Number(sp.get("limit")) || 50,
    });
    return ok({ count: items.length, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

// POST /api/content  { url, title?, body? }
// Manuel URL ekleme (Capture). SSRF yok — URL fetch ETMEYİZ, yalnız kaydederiz.
const ManualSchema = z.object({
  url: z.string().url(),
  title: z.string().max(500).optional(),
  body: z.string().max(20000).optional(),
});

function isSafeScheme(url: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return fail("Yetkisiz", 403, { code: "forbidden" });
  }
  try {
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);
    const parsed = ManualSchema.safeParse(body.data);
    if (!parsed.success) {
      return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
    }
    if (!isSafeScheme(parsed.data.url)) {
      return fail("Yalnız http/https URL kabul edilir", 400);
    }
    const item = await ingestContent(
      fromManualUrl(parsed.data.url, parsed.data.title, parsed.data.body),
    );
    return ok({ item }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
