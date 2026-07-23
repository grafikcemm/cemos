import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { ytVideoRepo } from "@/lib/db/ytVideoRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { __resetDbCircuitForTests } from "@/lib/db/dbCircuit";
import { DB_UNAVAILABLE_MESSAGE } from "@/lib/db/dbUnavailableError";

vi.mock("@/lib/db/ytVideoRepo", () => ({
  ytVideoRepo: { listOpportunities: vi.fn() },
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

const makeReq = () => new NextRequest("http://localhost:3000/api/youtube/videos");

/**
 * WP-01 straggler regresyonu (canlı 500 kanıtı 2026-07-23): bu route catch'siz
 * olduğundan DB-down uncaught framework-500 + redaktesiz stack-log üretiyordu.
 * Diğer 5 straggler (learn/sources GET, learn/jobs, learn/packs, transcript,
 * eval/runs) aynı deseni paylaşır — bu dosya sınıfın temsilî kanıtıdır.
 */
describe("GET /api/youtube/videos — DB-down 503 sözleşmesi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDbCircuitForTests();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  });

  it("403 when unauthorized", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    expect((await GET(makeReq())).status).toBe(403);
  });

  it("happy path 200", async () => {
    vi.mocked(ytVideoRepo.listOpportunities).mockResolvedValue([] as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, count: 0 });
  });

  it("DB-unavailable → structured 503, no raw hostname (was: uncaught framework-500)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(ytVideoRepo.listOpportunities).mockRejectedValue(
      Object.assign(
        new Error("Can't reach database server at `ep-fake-branch-123456-pooler.c-1.us-east-1.aws.neon.tech:5432`"),
        { name: "PrismaClientInitializationError" },
      ),
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toMatchObject({
      success: false,
      error: DB_UNAVAILABLE_MESSAGE,
      code: "db_unavailable",
      retryable: true,
    });
    expect(JSON.stringify(json)).not.toContain("neon.tech");
    vi.restoreAllMocks();
  });

  it("generic error → 500 with redacted message (choke-point)", async () => {
    vi.mocked(ytVideoRepo.listOpportunities).mockRejectedValue(new Error("beklenmedik durum"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe("beklenmedik durum");
  });
});
