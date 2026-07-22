import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { ok, fail } from "@/lib/utils/apiResponse";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { boardMembershipFor } from "@/lib/boards/saveToBoard";
import {
  flattenKeywords,
  mergeAndPaginate,
  emptyCounts,
  type LibItem,
  type LibItemType,
  type KeywordJson,
} from "@/lib/library/librarySearch";
import keywordData from "@/data/keyword-library.json";

export const dynamic = "force-dynamic";

// Per-source fetch bound. take = min(offset+limit, TAKE_CAP): shallow pages fetch
// little; deep pages beyond the cap are honestly flagged `capped` (not silently
// truncated to a wrong page). Merge-across-sources is stable within the cap
// because every source is createdAt-desc + id tie-broken (deterministic order).
const TAKE_CAP = 500;

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/**
 * Birleşik kütüphane arama (05 §D1) — viral/prompt/pattern/content DB kaynaklarını
 * + statik keyword JSON'unu tek tipli, SAYFALI sonuç kümesinde birleştirir.
 * Server-side sorgu + sayfalama (büyük veri seti client'a tam çekilmez).
 */
export async function GET(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const type = (sp.get("type") ?? "all") as LibItemType | "all";
  const platform = (sp.get("platform") ?? "all").toLowerCase();
  const limit = Math.min(Math.max(1, Number(sp.get("limit")) || 24), 60);
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const take = Math.min(offset + limit, TAKE_CAP);
  const like = q ? { contains: q, mode: "insensitive" as const } : undefined;

  const want = (t: LibItemType) => type === "all" || type === t;
  const platformIs = (p: string) => platform === "all" || platform === p;

  const counts = emptyCounts();
  const all: LibItem[] = [];

  try {
    if (want("viral") && platformIs("x")) {
      const where = like ? { OR: [{ text: like }, { authorHandle: like }] } : {};
      const [rows, count] = await Promise.all([
        prisma.savedViralTweet.findMany({ where, orderBy: { savedAt: "desc" }, take }),
        prisma.savedViralTweet.count({ where }),
      ]);
      counts.viral = count;
      for (const r of rows) {
        all.push({
          id: `viral-${r.id}`,
          type: "viral",
          title: `@${r.authorHandle}`,
          body: r.text,
          platform: "x",
          meta: `viral ${r.viralScore}`,
          tags: parseTags(r.tags),
          createdAt: r.savedAt.toISOString(),
          canAnalyze: true,
          sourceUrl: r.url || undefined,
          score: r.viralScore,
        });
      }
    }

    if (want("prompt") && platform === "all") {
      const where = like ? { OR: [{ title: like }, { promptText: like }, { useCase: like }] } : {};
      const [rows, count] = await Promise.all([
        prisma.promptTemplate.findMany({ where, orderBy: { createdAt: "desc" }, take }),
        prisma.promptTemplate.count({ where }),
      ]);
      counts.prompt = count;
      for (const r of rows) {
        all.push({
          id: `prompt-${r.id}`,
          type: "prompt",
          title: r.title,
          body: r.promptText,
          meta: r.category,
          tags: parseTags(r.tags),
          createdAt: r.createdAt.toISOString(),
        });
      }
    }

    if (want("pattern") && platformIs("x")) {
      const where = like ? { OR: [{ patternName: like }, { exampleGood: like }] } : {};
      const [rows, count] = await Promise.all([
        prisma.viralPattern.findMany({ where, orderBy: { createdAt: "desc" }, take }),
        prisma.viralPattern.count({ where }),
      ]);
      counts.pattern = count;
      for (const r of rows) {
        all.push({
          id: `pattern-${r.id}`,
          type: "pattern",
          title: r.patternName,
          body: r.exampleGood || r.hookType || "",
          platform: r.platform,
          meta: `skor ${r.successScore}`,
          tags: [r.category, r.hookType].filter((t): t is string => !!t),
          createdAt: r.createdAt.toISOString(),
          score: r.successScore,
          // Phase 5A: manuel küratörlük (isActive). validatedAt = ayrı otomatik eksen.
          archived: !r.isActive,
        });
      }
    }

    if (want("content")) {
      const base = like ? { OR: [{ title: like }, { body: like }, { author: like }] } : {};
      const where = platform !== "all" ? { ...base, platform } : base;
      const [rows, count] = await Promise.all([
        prisma.contentItem.findMany({ where, orderBy: { createdAt: "desc" }, take }),
        prisma.contentItem.count({ where }),
      ]);
      counts.content = count;
      for (const r of rows) {
        all.push({
          id: `content-${r.id}`,
          type: "content",
          title: r.title || r.author || "İçerik",
          body: r.body || r.transcript || "",
          platform: r.platform,
          meta: r.format,
          tags: [],
          createdAt: r.createdAt.toISOString(),
          canAnalyze: true,
          contentItemId: r.id,
          sourceUrl: r.canonicalUrl || undefined,
        });
      }
    }

    if (want("keyword") && platform === "all") {
      const kw = flattenKeywords(keywordData as KeywordJson, q);
      counts.keyword = kw.length;
      all.push(...kw);
    }

    const total = counts.viral + counts.keyword + counts.prompt + counts.pattern + counts.content;
    const items = mergeAndPaginate(all, offset, limit);

    // Board-membership for canonical content on THIS page only — ONE batched
    // query (no N+1). Non-content items carry no canonical membership.
    const pageContentIds = items
      .filter((it) => it.type === "content" && it.contentItemId)
      .map((it) => it.contentItemId as string);
    if (pageContentIds.length > 0) {
      const membership = await boardMembershipFor(pageContentIds);
      for (const it of items) {
        if (it.type === "content" && it.contentItemId && membership[it.contentItemId]) {
          it.savedBoards = membership[it.contentItemId];
        }
      }
    }

    // Honest cap: a deep page whose (offset+limit) exceeds the per-source fetch
    // bound cannot be served completely — flag it rather than silently truncate.
    const capped = offset + limit > TAKE_CAP;
    return ok({ items, total, counts, limit, offset, capped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Arama başarısız";
    return fail(msg, 500);
  }
}
