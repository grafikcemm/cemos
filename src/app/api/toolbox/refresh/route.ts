import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { assertSafePin } from "@/lib/verify/ssrfGuard";
import { makePinnedFetch } from "@/lib/verify/pinnedFetch";
import { fail } from "@/lib/utils/apiResponse";
import { dbErrorResponse } from "@/lib/utils/dbErrorResponse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEAD_TIMEOUT_MS = 8_000;
const BATCH_SIZE = 10;
const MAX_REDIRECTS = 5;

// Probe one URL with a timeout-bounded HEAD request. SSRF-guarded: EACH hop is
// validated (assertSafePin blocks private/metadata/credentialed targets) AND the
// socket is PINNED to the just-verified IP (makePinnedFetch), so no DNS-rebind can
// swap in a private target between check and connect. Redirects are followed
// MANUALLY so a 3xx to an internal host is re-checked + re-pinned. Fail-open: any
// error (blocked, timeout, DNS, refused, non-2xx, too many redirects) resolves to
// "dead" — never throws.
async function probe(url: string): Promise<"alive" | "dead"> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const safe = await assertSafePin(current);
      const pinnedFetch = makePinnedFetch(safe.pinIp, safe.pinFamily);
      const res = await pinnedFetch(safe.url.toString(), {
        method: "HEAD",
        redirect: "manual",
        signal: ctrl.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return "dead";
        current = new URL(loc, safe.url).toString(); // re-validated + re-pinned next iteration
        continue;
      }
      return res.ok ? "alive" : "dead";
    }
    return "dead"; // too many redirects
  } catch {
    return "dead";
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/toolbox/refresh — HEAD-check every active resource URL in batches,
// persist linkStatus + lastCheckedAt. Fail-open: a single bad URL marks that
// row "dead" but never fails the whole route.
export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, code: "forbidden" }, { status: 403 });
  }

  try {
    const resources = await prisma.toolboxResource.findMany({
      where: { isActive: true },
      select: { id: true, url: true },
    });

    const now = new Date();
    let alive = 0;
    let dead = 0;

    for (let i = 0; i < resources.length; i += BATCH_SIZE) {
      const batch = resources.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (r) => {
          const linkStatus = await probe(r.url);
          await prisma.toolboxResource.update({
            where: { id: r.id },
            data: { linkStatus, lastCheckedAt: now },
          });
          return linkStatus;
        })
      );
      for (const res of results) {
        if (res.status === "fulfilled" && res.value === "alive") alive++;
        else dead++;
      }
    }

    return NextResponse.json({ success: true, alive, dead, checked: resources.length });
  } catch (err) {
    const dbRes = dbErrorResponse(err);
    if (dbRes) return dbRes;
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return fail(msg, 500);
  }
}
