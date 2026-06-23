import type { NextRequest } from "next/server";
import { z } from "zod";
import { performanceRepo } from "@/lib/db/performanceRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/published-posts?accountId=&limit=  — published posts + their snapshots.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const accountId = sp.get("accountId");
  if (!accountId) {
    return fail("accountId gerekli", 400);
  }
  try {
    const posts = await performanceRepo.listPublished(accountId, Number(sp.get("limit")) || 50);
    return ok({ count: posts.length, posts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

const PublishSchema = z.object({
  accountId: z.string().min(1),
  platform: z.string().max(40).optional(),
  content: z.string().max(20000).optional(),
  url: z.string().max(2000).optional(),
  externalId: z.string().max(200).optional(),
  draftQueueItemId: z.string().optional(),
  ideaId: z.string().optional(),
});

const SnapshotSchema = z.object({
  publishedPostId: z.string().min(1),
  window: z.enum(["1h", "6h", "24h", "3d", "7d", "30d"]),
  metrics: z.record(z.string(), z.unknown()),
  normalizedScore: z.number().optional(),
});

// POST /api/published-posts            — record a published post (provenance from draft/idea).
// POST /api/published-posts?action=snapshot — upsert a performance snapshot (idempotent per window).
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const action = req.nextUrl.searchParams.get("action");
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  try {
    if (action === "snapshot") {
      const parsed = SnapshotSchema.safeParse(body.data);
      if (!parsed.success) {
        return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
      }
      const snapshot = await performanceRepo.upsertSnapshot({
        publishedPostId: parsed.data.publishedPostId,
        window: parsed.data.window,
        metrics: parsed.data.metrics,
        normalizedScore: parsed.data.normalizedScore ?? 0,
      });
      return ok({ snapshot }, { status: 201 });
    }
    const parsed = PublishSchema.safeParse(body.data);
    if (!parsed.success) {
      return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
    }
    const post = await performanceRepo.createPublished(parsed.data);
    return ok({ post }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
