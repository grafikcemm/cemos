import type { NextRequest } from "next/server";
import { z } from "zod";
import { boardRepo } from "@/lib/db/boardRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/boards/[id]  — board + sections + items (with canonical content).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  try {
    const board = await boardRepo.withItems(id);
    if (!board) {
      return fail("Bulunamadı", 404);
    }
    return ok({ board });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}

const AddItemSchema = z.object({
  contentItemId: z.string().optional(),
  sectionId: z.string().optional(),
  itemType: z.string().max(40).optional(),
  title: z.string().max(500).optional(),
  url: z.string().max(2000).optional(),
  note: z.string().max(20000).optional(),
});

// POST /api/boards/[id]  — save an item to the board (save-to-board action).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = AddItemSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  try {
    const board = await boardRepo.getById(id);
    if (!board) {
      return fail("Bulunamadı", 404);
    }
    const item = await boardRepo.addItem({ boardId: id, ...parsed.data });
    return ok({ item }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
