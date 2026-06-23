import type { NextRequest } from "next/server";
import { igCommentRepo } from "@/lib/db/igCommentRepo";
import { igMediaRepo } from "@/lib/db/igMediaRepo";
import { isConfigured, getTokenHealth, getOwnUsername } from "@/lib/instagram/igClient";
import { ok } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

function num(v: string | null): number | undefined {
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

type MediaInfo = { caption: string; permalink: string; postedAt: string | null };

// GET /api/instagram/comments?status=&minPriority=&intent=&mediaId=&limit=
// Kendi yanıtlarımız hariç tutulur; her yorumun ait olduğu gönderi (media) bilgisi döner.
function toMediaInfo(m: { caption: string | null; permalink: string | null; postedAt: Date | null }): MediaInfo {
  return {
    caption: m.caption ?? "",
    permalink: m.permalink ?? "",
    postedAt: m.postedAt ? m.postedAt.toISOString() : null,
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ownUsername = await getOwnUsername();
  const limit = num(sp.get("limit")) ?? 25;
  const [configured, comments, tokenHealth, recentMedia] = await Promise.all([
    isConfigured(),
    igCommentRepo.listFeed({
      status: sp.get("status") ?? undefined,
      intent: sp.get("intent") ?? undefined,
      mediaId: sp.get("mediaId") ?? undefined,
      minPriority: num(sp.get("minPriority")),
      limit: num(sp.get("limit")),
      excludeUsername: ownUsername ?? undefined,
    }),
    getTokenHealth(),
    igMediaRepo.listRecent(limit),
  ]);

  // Media list is driven by ALL recent posts (newest first) so 0-comment posts
  // still appear — the UI keys off mediaOrder, not just media that have comments.
  const media: Record<string, MediaInfo> = {};
  const mediaOrder: string[] = [];
  for (const m of recentMedia) {
    media[m.mediaId] = toMediaInfo(m);
    mediaOrder.push(m.mediaId);
  }

  // Comments may reference posts outside the recent window — append those too.
  const missingIds = [...new Set(comments.map((c) => c.mediaId))].filter((id) => !media[id]);
  if (missingIds.length > 0) {
    const extra = await igMediaRepo.listByMediaIds(missingIds);
    for (const m of extra) {
      media[m.mediaId] = toMediaInfo(m);
      mediaOrder.push(m.mediaId);
    }
    // mediaId present in a comment but with no IgMedia row at all — still surface it.
    for (const id of missingIds) {
      if (!media[id]) {
        media[id] = { caption: "", permalink: "", postedAt: null };
        mediaOrder.push(id);
      }
    }
  }

  return ok({ configured, tokenHealth, ownUsername, comments, media, mediaOrder });
}
