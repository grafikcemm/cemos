import type { NextRequest } from "next/server";
import { sourcePostRepo } from "@/lib/db/sourcePostRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  try {
    const { id } = await params;

    const post = await sourcePostRepo.findById(id);
    if (!post) {
      return fail("Gönderi bulunamadı", 404);
    }

    const updated = await sourcePostRepo.markIgnored(id);

    return ok({
      post: updated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected system error";
    return fail(msg, 500);
  }
}
