import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEAD_TIMEOUT_MS = 8_000;
const BATCH_SIZE = 10;

// Probe one URL with a timeout-bounded HEAD request. Fail-open: any error
// (timeout, DNS, refused, non-2xx) resolves to "dead" — never throws.
async function probe(url: string): Promise<"alive" | "dead"> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    return res.ok ? "alive" : "dead";
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
