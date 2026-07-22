import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));
vi.mock("@/lib/services/calibrationStatus", () => ({ buildCalibrationStatus: vi.fn() }));

import { GET } from "./route";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { buildCalibrationStatus } from "@/lib/services/calibrationStatus";

function req() {
  return new NextRequest("http://localhost:3000/api/quality/calibration");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
});

describe("GET /api/quality/calibration (ADR-046)", () => {
  it("yetkisiz 403", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(buildCalibrationStatus).not.toHaveBeenCalled();
  });

  it("durum döner 200", async () => {
    vi.mocked(buildCalibrationStatus).mockResolvedValue({
      outcomeCalibrated: false,
      reason: "KALİBRE DEĞİL",
      samples: [],
      normalization: { active: false, note: "" },
      thresholds: { readinessPolicyVersion: "1.1.0-provisional", provisional: true, note: "" },
      eval: {
        registryContract: { present: false, status: null, mode: null, policyVersion: null, passed: 0, failed: 0, at: null },
        golden: { present: false, status: null, mode: null, policyVersion: null, passed: 0, failed: 0, at: null },
      },
      blockers: [],
      sectionErrors: [],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status.outcomeCalibrated).toBe(false);
  });

  it("hata → 500", async () => {
    vi.mocked(buildCalibrationStatus).mockRejectedValue(new Error("boom"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
