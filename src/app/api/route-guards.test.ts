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

// Routes hardened in the P1 stability audit (previously unguarded read endpoints
// that returned operator data to any caller). Each must now 403 a bare request.
import { GET as competitorsGET } from "./competitors/route";
import { GET as outliersGET } from "./content/outliers/route";
import { GET as dailyDigestGET } from "./daily-digest/route";
import { GET as flowRadarGET } from "./growth/flow-radar/route";
import { GET as learningStatusGET } from "./growth/learning-status/route";
import { GET as patternLibraryGET } from "./growth/pattern-library/route";
import { GET as pipelineTraceGET } from "./growth/pipeline-trace/route";
import { GET as sourceIntelligenceGET } from "./growth/source-intelligence/route";
import { GET as trainingCenterGET } from "./growth/training-center/route";
import { GET as learnJobGET } from "./learn/jobs/[id]/route";
import { GET as learnPackGET } from "./learn/packs/[id]/route";
import { GET as promptLibraryGET } from "./prompt-library/route";
import { GET as repoRadarGET } from "./repo-radar/route";
import { GET as evalRunsGET } from "./eval/runs/route";
import { GET as dnaObservationGET } from "./instagram/dna-observation/route";
import { POST as dnaApplyPOST } from "./instagram/dna-observation/apply/route";
import { GET as sourcePostsGET } from "./source-posts/route";
import { GET as toolboxGET } from "./toolbox/route";
import { GET as youtubeVideosGET } from "./youtube/videos/route";

function bareReq(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

// The dynamic learn routes take a ctx param, but the guard runs first and
// returns before ctx is read — wrap them to the shared handler signature.
const dummyIdCtx = { params: Promise.resolve({ id: "x" }) };

describe("operator-guarded read endpoints reject non-same-origin (DH-005)", () => {
  const cases: Array<[string, (req: NextRequest) => Promise<Response>]> = [
    ["/api/queue?account=grafikcem", queueGET],
    ["/api/costs", costsGET],
    ["/api/settings", settingsGET],
    ["/api/growth/daily-queue", growthDailyQueueGET],
    ["/api/competitors", competitorsGET],
    ["/api/content/outliers", outliersGET],
    ["/api/daily-digest", dailyDigestGET],
    ["/api/growth/flow-radar", flowRadarGET],
    ["/api/growth/learning-status", learningStatusGET],
    ["/api/growth/pattern-library", patternLibraryGET],
    ["/api/growth/pipeline-trace", pipelineTraceGET],
    ["/api/growth/source-intelligence", sourceIntelligenceGET],
    ["/api/growth/training-center", trainingCenterGET],
    ["/api/learn/jobs/abc", (req) => learnJobGET(req, dummyIdCtx)],
    ["/api/learn/packs/abc", (req) => learnPackGET(req, dummyIdCtx)],
    ["/api/prompt-library", promptLibraryGET],
    ["/api/repo-radar", repoRadarGET],
    ["/api/eval/runs", evalRunsGET],
    // /api/settings/operator-readiness KALDIRILDI (ADR-034 §F): tek tüketicisi
    // OperatorReadinessGate idi; gate artık canonical /api/health contract'ından
    // beslenir. operator-scan-now POST'u yaşamaya devam eder.
    ["/api/instagram/dna-observation", dnaObservationGET],
    ["/api/instagram/dna-observation/apply", dnaApplyPOST],
    ["/api/source-posts", sourcePostsGET],
    ["/api/toolbox", toolboxGET],
    ["/api/youtube/videos", youtubeVideosGET],
  ];

  it.each(cases)("%s → 403 without same-origin header", async (path, handler) => {
    const res = await handler(bareReq(path));
    expect(res.status).toBe(403);
  });
});
