import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";

const SavedTweetSchema = z.object({
  id: z.string().min(1).max(64),
  channel: z.string().max(64).nullish(),
  authorHandle: z.string().min(1).max(128),
  text: z.string().min(1).max(4000),
  likeCount: z.number().int().min(0).default(0),
  retweetCount: z.number().int().min(0).default(0),
  viewCount: z.number().int().min(0).default(0),
  viralScore: z.number().int().min(0).max(100).default(0),
  url: z.string().max(512).default(""),
  source: z.string().max(128).default(""),
  mediaUrl: z.string().max(512).nullish(),
  mediaType: z.string().max(32).nullish(),
  note: z.string().max(2000).default(""),
  tags: z.array(z.string().max(64)).max(20).default([]),
});

const PostBodySchema = z.object({
  // Tekil kayıt veya bulk (localStorage göçü) — ikisi de idempotent upsert.
  tweet: SavedTweetSchema.optional(),
  tweets: z.array(SavedTweetSchema).max(500).optional(),
});

// GET /api/viral-library?channel=&limit=
export async function GET(req: NextRequest) {
  // Tek-operatör okuma: same-origin (UI) veya cron-secret (DH-005 deseni).
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const sp = req.nextUrl.searchParams;
  const channel = sp.get("channel");
  const limit = Math.min(Number(sp.get("limit")) || 200, 500);

  try {
    const rows = await prisma.savedViralTweet.findMany({
      where: channel && channel !== "all" ? { channel } : undefined,
      orderBy: { savedAt: "desc" },
      take: limit,
    });
    const items = rows.map((r) => ({ ...r, tags: safeParseArray(r.tags) }));
    return ok({ count: items.length, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

// POST /api/viral-library — tekil {tweet} veya bulk {tweets} upsert.
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON gövdesi", 400);
  const parsed = PostBodySchema.safeParse(body.data);
  if (!parsed.success) return fail("Geçersiz istek", 400, { detail: parsed.error.flatten() });

  const incoming = [
    ...(parsed.data.tweet ? [parsed.data.tweet] : []),
    ...(parsed.data.tweets ?? []),
  ];
  if (incoming.length === 0) return fail("tweet veya tweets gerekli", 400);

  try {
    let saved = 0;
    for (const t of incoming) {
      const data = {
        channel: t.channel ?? null,
        authorHandle: t.authorHandle,
        text: t.text,
        likeCount: t.likeCount,
        retweetCount: t.retweetCount,
        viewCount: t.viewCount,
        viralScore: t.viralScore,
        url: t.url,
        source: t.source,
        mediaUrl: t.mediaUrl ?? null,
        mediaType: t.mediaType ?? null,
        note: t.note,
        tags: JSON.stringify(t.tags),
      };
      await prisma.savedViralTweet.upsert({
        where: { id: t.id },
        create: { id: t.id, ...data },
        update: data,
      });
      saved += 1;
    }
    return ok({ saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

// DELETE /api/viral-library?id=
export async function DELETE(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return fail("id param gerekli", 400);

  try {
    await prisma.savedViralTweet.deleteMany({ where: { id } });
    return ok({ deleted: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
