import { z } from "zod";
import { prisma } from "@/lib/db/client";
import type { ContentItem } from "@/generated/prisma/client";
import { ingestContent } from "@/lib/content/ingestService";
import {
  fromNewsItem,
  fromYtVideo,
  fromSourcePost,
  fromIgMedia,
  fromRepoRadarItem,
} from "@/lib/content/normalizer";

/**
 * Research → canonical ContentItem bridge (Phase 4B / ADR-041).
 *
 * The client sends only a typed source REFERENCE ({ kind, id }); the server
 * re-loads the AUTHORITATIVE origin row and runs the matching typed normalizer.
 * Trimmed/untrusted client DTO fields are NEVER used to build the ContentItem —
 * no fabricated canonical records. `ingestContent` upserts idempotently on
 * (platform, externalId), so re-capturing the same source reconciles metadata
 * instead of creating a duplicate.
 *
 * Unsupported research shapes (pipeline counters, verdict summaries) are NOT
 * forced into a ContentItem — the caller reports them honestly as unsupported.
 */

export const SaveSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contentItem"), contentItemId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("news"), id: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("ytVideo"), videoId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("sourcePost"), id: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("igMedia"), mediaId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("repo"), id: z.string().min(1).max(64) }),
]);
export type SaveSource = z.infer<typeof SaveSourceSchema>;

export type ResolveSourceFailureCode = "source_not_found" | "unsupported_source";

export type ResolveSourceResult =
  | { ok: true; contentItem: ContentItem }
  | { ok: false; code: ResolveSourceFailureCode; message: string };

function notFound(): ResolveSourceResult {
  return { ok: false, code: "source_not_found", message: "Kaynak bulunamadı — liste değişmiş olabilir." };
}

export async function resolveSourceToContentItem(source: SaveSource): Promise<ResolveSourceResult> {
  switch (source.kind) {
    case "contentItem": {
      const ci = await prisma.contentItem.findUnique({ where: { id: source.contentItemId } });
      return ci ? { ok: true, contentItem: ci } : notFound();
    }
    case "news": {
      const row = await prisma.newsItem.findUnique({ where: { id: source.id } });
      return row ? { ok: true, contentItem: await ingestContent(fromNewsItem(row)) } : notFound();
    }
    case "ytVideo": {
      const row = await prisma.ytVideo.findUnique({ where: { videoId: source.videoId } });
      return row ? { ok: true, contentItem: await ingestContent(fromYtVideo(row)) } : notFound();
    }
    case "sourcePost": {
      const row = await prisma.sourcePost.findUnique({ where: { id: source.id } });
      return row ? { ok: true, contentItem: await ingestContent(fromSourcePost(row)) } : notFound();
    }
    case "igMedia": {
      const row = await prisma.igMedia.findUnique({ where: { mediaId: source.mediaId } });
      return row ? { ok: true, contentItem: await ingestContent(fromIgMedia(row)) } : notFound();
    }
    case "repo": {
      const row = await prisma.repoRadarItem.findUnique({ where: { id: source.id } });
      return row ? { ok: true, contentItem: await ingestContent(fromRepoRadarItem(row)) } : notFound();
    }
    default: {
      const _exhaustive: never = source;
      return { ok: false, code: "unsupported_source", message: "Desteklenmeyen kaynak türü." };
    }
  }
}
