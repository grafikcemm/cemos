import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { workerService } from "@/lib/services/workerService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/services/workerService", () => ({
  workerService: { scanTick: vi.fn() },
}));
vi.mock("@/lib/services/operatorReadinessService", () => ({
  operatorReadinessService: { getReadiness: vi.fn(() => ({ monthlyBudgetExceeded: false, totalMonthCost: 0 })) },
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

function makeReq() {
  return new NextRequest("http://localhost:3000/api/settings/operator-scan-now", {
    method: "POST",
  });
}

describe("POST /api/settings/operator-scan-now", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  });

  it("yetkisiz istek 403 — scanTick çağrılmaz", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("forbidden");
    expect(workerService.scanTick).not.toHaveBeenCalled();
  });
});
