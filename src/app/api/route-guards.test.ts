import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

// DH-005 regression guard: every operator-guarded read endpoint must reject a
// request that carries no same-origin signal (and no cron secret) with 403,
// BEFORE any DB access. The guard is the first line of each handler, so these
// assertions need no Prisma mocks. (news-pool has its own colocated guard test.)
import { GET as queueGET } from "./queue/route";
import { GET as costsGET } from "./costs/route";
import { GET as settingsGET } from "./settings/route";
import { GET as growthDailyQueueGET } from "./growth/daily-queue/route";

function bareReq(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("operator-guarded read endpoints reject non-same-origin (DH-005)", () => {
  const cases: Array<[string, (req: NextRequest) => Promise<Response>]> = [
    ["/api/queue?account=grafikcem", queueGET],
    ["/api/costs", costsGET],
    ["/api/settings", settingsGET],
    ["/api/growth/daily-queue", growthDailyQueueGET],
  ];

  it.each(cases)("%s → 403 without same-origin header", async (path, handler) => {
    const res = await handler(bareReq(path));
    expect(res.status).toBe(403);
  });
});
