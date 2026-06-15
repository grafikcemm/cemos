import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { youtubeService } from "@/lib/services/youtubeService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { BudgetExceededError } from "@/lib/config/costGate";

vi.mock("@/lib/services/youtubeService", () => ({
  youtubeService: { briefForVideo: vi.fn() },
}));
vi.mock("@/lib/db/ytBriefRepo", () => ({ ytBriefRepo: { listByVideo: vi.fn() } }));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

function makeReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/youtube/briefs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/youtube/briefs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  });

  it("geçerli videoId → 200 + brief sonucu", async () => {
    vi.mocked(youtubeService.briefForVideo).mockResolvedValue({
      briefId: "b1",
      stagesCompleted: 5,
      transcriptUsed: true,
      costUsd: 0.05,
      warnings: [],
    });
    const res = await POST(makeReq({ videoId: "v1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.briefId).toBe("b1");
  });

  it("videoId yoksa 400", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(youtubeService.briefForVideo).not.toHaveBeenCalled();
  });

  it("bütçe aşıldıysa 429 code:budget", async () => {
    vi.mocked(youtubeService.briefForVideo).mockRejectedValue(new BudgetExceededError(5, 2));
    const res = await POST(makeReq({ videoId: "v1" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("budget");
  });

  it("yetkisiz istek 403", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq({ videoId: "v1" }));
    expect(res.status).toBe(403);
    expect(youtubeService.briefForVideo).not.toHaveBeenCalled();
  });
});
