import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { setModelProfile } from "@/lib/services/settingsService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/services/settingsService", () => ({
  setModelProfile: vi.fn(async (p: string) => p),
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({
  isOperatorOrCronAuthorized: vi.fn(() => true),
}));

function makeReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/settings/model-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/settings/model-profile (durable)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  });

  it("unauthorized → 403, no durable write", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq({ profile: "premium" }));
    expect(res.status).toBe(403);
    expect(setModelProfile).not.toHaveBeenCalled();
  });

  it("invalid profile → 400, no durable write", async () => {
    const res = await POST(makeReq({ profile: "turbo" }));
    expect(res.status).toBe(400);
    expect(setModelProfile).not.toHaveBeenCalled();
  });

  it("valid profile → persists durably and returns durable:true", async () => {
    const res = await POST(makeReq({ profile: "operator_quality" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    // ok() envelope is flat: { success: true, ...payload }
    expect(json.success).toBe(true);
    expect(json.durable).toBe(true);
    expect(json.profile).toBe("operator_quality");
    expect(setModelProfile).toHaveBeenCalledWith("operator_quality");
  });

  it("surfaces a durable-write failure as 500 (no false success)", async () => {
    vi.mocked(setModelProfile).mockRejectedValueOnce(new Error("db down"));
    const res = await POST(makeReq({ profile: "premium" }));
    expect(res.status).toBe(500);
  });
});
