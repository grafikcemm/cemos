import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { discoveryService } from "@/lib/services/discoveryService";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/accounts", () => ({
  accountProfiles: { grafikcem: { handle: "grafikcem" } },
}));

vi.mock("@/lib/services/discoveryService", () => ({
  discoveryService: {
    discoverForAccount: vi.fn(() =>
      Promise.resolve({ fetched: 12, afterDedupe: 9, kept: 5, inserted: 4, byType: {}, preFilterUsedLlm: false, errors: [] })
    ),
  },
}));

function makeReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/growth/discover", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/growth/discover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for an unknown handle", async () => {
    const res = await POST(makeReq({ handle: "bilinmeyen" }));
    expect(res.status).toBe(400);
    expect(discoveryService.discoverForAccount).not.toHaveBeenCalled();
  });

  it("runs discovery and passes the summary through", async () => {
    const res = await POST(makeReq({ handle: "grafikcem" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.inserted).toBe(4);
    expect(discoveryService.discoverForAccount).toHaveBeenCalledWith("grafikcem");
  });

  it("returns 500 with the service error message", async () => {
    vi.mocked(discoveryService.discoverForAccount).mockRejectedValueOnce(new Error("kaynak yok"));
    const res = await POST(makeReq({ handle: "grafikcem" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("kaynak yok");
  });
});
