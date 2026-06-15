import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { queueRepo } from "@/lib/db/queueRepo";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { findById: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: { findById: vi.fn() },
}));
vi.mock("@/lib/growth-engine/feedback-service", () => ({
  processFeedback: vi.fn(),
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

function makeReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/growth/daily-queue/q1/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/growth/daily-queue/[id]/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  });

  it("yetkisiz istek 403 — lookup ve processFeedback çağrılmaz", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq({ feedbackType: "approved" }), {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("forbidden");
    expect(queueRepo.findById).not.toHaveBeenCalled();
    expect(processFeedback).not.toHaveBeenCalled();
  });
});
