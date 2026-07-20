import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { assertSafeUrl } from "@/lib/verify/ssrfGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEAD_TIMEOUT_MS = 8_000;
const BATCH_SIZE = 10;
const MAX_REDIRECTS = 5;

// Probe one URL with a timeout-bounded HEAD request. SSRF-guarded: EACH hop is
// validated (assertSafeUrl blocks private/metadata/credentialed targets) and
// redirects are followed MANUALLY so a 3xx to an internal host is re-checked, not
// blindly followed. Fail-open: any error (blocked, timeout, DNS, refused, non-2xx,
// too many redirects) resolves to "dead" — never throws. Residual sub-second
// DNS-rebind TOCTOU is the same as verifyWebsite (no undici pinned-IP dispatcher
// available in this runtime); toolbox URLs are operator-curated, not attacker input.
async function probe(url: string): Promise<"alive" | "dead"> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const safe = await assertSafeUrl(current);
      const res = await fetch(safe.toString(), {
        method: "HEAD",
        redirect: "manual",
        signal: ctrl.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return "dead";
        current = new URL(loc, safe).toString(); // re-validated next iteration
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
    const msg = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
