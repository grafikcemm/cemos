import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { pipelineService } from "@/lib/services/pipelineService";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/accounts", () => ({
  accountProfiles: { grafikcem: { handle: "grafikcem" } },
}));

vi.mock("@/lib/services/pipelineService", () => ({
  pipelineService: {
    runDailyForAccount: vi.fn(() =>
      Promise.resolve({ handle: "grafikcem", created: 1, target: 1, reason: "generated" })
    ),
  },
}));

function makeReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/growth/generate-daily", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/growth/generate-daily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for an unknown handle", async () => {
    const res = await POST(makeReq({ handle: "bilinmeyen" }));
    expect(res.status).toBe(400);
    expect(pipelineService.runDailyForAccount).not.toHaveBeenCalled();
  });

  it("generates from backlog only (discover:false, mine:false)", async () => {
    const res = await POST(makeReq({ handle: "grafikcem" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.created).toBe(1);
    expect(pipelineService.runDailyForAccount).toHaveBeenCalledWith("grafikcem", {
      discover: false,
      mine: false,
    });
  });

  it("returns 500 with the service error message", async () => {
    vi.mocked(pipelineService.runDailyForAccount).mockRejectedValueOnce(new Error("bütçe doldu"));
    const res = await POST(makeReq({ handle: "grafikcem" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("bütçe doldu");
  });
});
