import { NextRequest } from "next/server";
import { z } from "zod";
import { contentItemRepo } from "@/lib/db/contentItemRepo";
import { creatorRepo } from "@/lib/db/creatorRepo";
import { boardRepo } from "@/lib/db/boardRepo";
import { ideaRepo } from "@/lib/db/ideaRepo";
import { contentEmbeddingRepo } from "@/lib/db/contentEmbeddingRepo";
import { embedText, rankBySimilarity } from "@/lib/content/search";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";

// CemOS MCP — READ-ONLY v1 (Faz CI-7). Eden ilkesi: önce read-only; write tools
// (create_idea, save_to_board, ...) ileride confirmation+audit ile gelir.
// GET → araç kataloğu. POST {tool, args} → tek read aracı çalıştırır.

const TOOLS = [
  { name: "search_content", desc: "Semantic search over canonical content. args:{q,limit?}" },
  { name: "list_content", desc: "List content items. args:{platform?,format?,limit?}" },
  { name: "list_outliers", desc: "Top creator-relative outliers. args:{limit?}" },
  { name: "list_boards", desc: "List boards. args:{accountId?}" },
  { name: "get_board", desc: "Board with items. args:{boardId}" },
  { name: "list_ideas", desc: "List ideas. args:{accountId?,status?,limit?}" },
  { name: "get_idea", desc: "Idea with sources. args:{ideaId}" },
] as const;

export async function GET() {
  return ok({ server: "cemos-mcp", mode: "read-only", tools: TOOLS });
}

const CallSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
});

function parseVec(json: string): number[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as number[]) : [];
  } catch {
    return [];
  }
}

async function dispatch(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const num = (k: string, d: number) => (typeof args[k] === "number" ? (args[k] as number) : d);
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : undefined);

  switch (tool) {
    case "search_content": {
      const q = (str("q") ?? "").trim();
      if (!q) throw new Error("q gerekli");
      const queryVec = embedText(q).values;
      const candidates = (await contentEmbeddingRepo.listAll()).map((e) => ({
        id: e.contentItemId,
        values: parseVec(e.embeddingJson),
      }));
      const hits = rankBySimilarity(queryVec, candidates, num("limit", 20));
      return Promise.all(hits.map((h) => contentItemRepo.getById(h.id)));
    }
    case "list_content":
      return contentItemRepo.list({ platform: str("platform"), format: str("format"), limit: num("limit", 50) });
    case "list_outliers":
      return creatorRepo.listTopOutliers(num("limit", 50));
    case "list_boards":
      return boardRepo.list(str("accountId"));
    case "get_board": {
      const id = str("boardId");
      if (!id) throw new Error("boardId gerekli");
      return boardRepo.withItems(id);
    }
    case "list_ideas":
      return ideaRepo.list({ accountId: str("accountId"), status: str("status"), limit: num("limit", 50) });
    case "get_idea": {
      const id = str("ideaId");
      if (!id) throw new Error("ideaId gerekli");
      return ideaRepo.getById(id);
    }
    default:
      throw new Error(`unknown tool: ${tool}`);
  }
}

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return fail("Yetkisiz", 403, { code: "forbidden" });
  }
  try {
    const body = await parseJsonBody(req);
    if (!body.ok) return fail("Geçersiz JSON", 400);
    const parsed = CallSchema.safeParse(body.data);
    if (!parsed.success) {
      return fail("Geçersiz girdi", 400);
    }
    const result = await dispatch(parsed.data.tool, parsed.data.args ?? {});
    return ok({ tool: parsed.data.tool, result });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    const status = msg.startsWith("unknown tool") ? 404 : 500;
    return fail(msg, status);
  }
}
