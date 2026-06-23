import type { NextRequest } from "next/server";
import { z } from "zod";
import { runDiscovery } from "@/lib/youtube/discovery";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { BudgetExceededError } from "@/lib/config/costGate";
import { ok, fail, parseJsonBody } from "@/lib/utils/apiResponse";

// Manuel kanal keşfi (search.list 100u/sorgu). Sadece operatör/cron; öneriler enabled:false.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const PostSchema = z.object({
  queries: z.array(z.string()).optional(),
  cap: z.number().optional(),
});

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) return fail("Yetkisiz", 403, { code: "forbidden" });
  const body = await parseJsonBody(req);
  if (!body.ok) return fail("Geçersiz JSON", 400);
  const parsed = PostSchema.safeParse(body.data);
  if (!parsed.success) {
    return fail("Geçersiz girdi", 400, { detail: parsed.error.flatten() });
  }
  const queries = parsed.data.queries?.filter((q): q is string => typeof q === "string");
  const cap = parsed.data.cap;
  try {
    const result = await runDiscovery({ queries, cap });
    return ok({ ...result });
  } catch (err) {
    if (err instanceof BudgetExceededError) return fail(err.message, 402, { code: "budget" });
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg, 500);
  }
}
