import type { NextRequest } from "next/server";
import { getTokenHealth, refreshLongLivedToken } from "@/lib/instagram/igClient";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { ok, fail } from "@/lib/utils/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/instagram/token — token sağlığı (açık okuma; sekme banner'ı)
export async function GET() {
  const health = await getTokenHealth();
  return ok({ ...health });
}

// POST /api/instagram/token — uzun ömürlü token'ı tazele → DB (guard, redeploy'suz)
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const r = await refreshLongLivedToken();
  if (!r.ok) {
    return fail(r.error ?? "Token tazeleme başarısız", 502);
  }
  return ok({ ...r.data });
}
