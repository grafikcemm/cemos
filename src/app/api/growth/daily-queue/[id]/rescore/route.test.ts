import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { scoreDraftWithAI, scoreDraftFallback } from "@/lib/growth-engine/scorer";
import { getBudgetStatus } from "@/lib/config/costGate";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/db/queueRepo", () => ({ queueRepo: { findById: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/db/accountRepo", () => ({ accountRepo: { findById: vi.fn() } }));
vi.mock("@/lib/growth-engine/scorer", () => ({ scoreDraftWithAI: vi.fn(), scoreDraftFallback: vi.fn() }));
vi.mock("@/lib/growth-engine/leak-detector", () => ({
  detectLeaks: vi.fn(() => []),
  conceptKeywordsFrom: vi.fn(() => []),
}));
vi.mock("@/lib/ai/next-move", () => ({ normalizeNextMove: vi.fn((v) => v ?? "none") }));
vi.mock("@/lib/accounts", () => ({ accountProfiles: {} }));
vi.mock("@/lib/config/costGate", () => ({
  getBudgetStatus: vi.fn(),
  inferAiBudgetClass: vi.fn(() => "background"),
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

const DRAFT_SCORE = {
  hookStrengthScore: 80, personaMatchScore: 75, clarityScore: 70, viralityScore: 65,
  noveltyScore: 60, riskScore: 20, publishScore: 75, publishRecommendation: "publish",
  rewriteSuggestion: "", reason: "", confidence: 80,
};

function makeReq(body: unknown = {}) {
  return new NextRequest("http://localhost:3000/api/growth/daily-queue/q1/rescore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "q1" }) };

describe("POST /api/growth/daily-queue/[id]/rescore — Phase 5A honest states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
    vi.mocked(queueRepo.findById).mockResolvedValue({
      id: "q1", accountId: "acc-1", content: "taslak metni", editedContent: null, mode: "ai_news", scores: "{}",
    } as any);
    vi.mocked(accountRepo.findById).mockResolvedValue({ id: "acc-1", handle: "grafikcem" } as any);
    vi.mocked(scoreDraftFallback).mockReturnValue(DRAFT_SCORE as any);
    vi.mocked(getBudgetStatus).mockResolvedValue({ allowed: true } as any);
  });

  it("403 when unauthorized", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq(), params);
    expect(res.status).toBe(403);
    expect(queueRepo.findById).not.toHaveBeenCalled();
  });

  it("402 blocked-external when AI budget exhausted — no silent heuristic, scores unchanged", async () => {
    vi.mocked(getBudgetStatus).mockResolvedValue({ allowed: false, reason: "monthly_limit" } as any);
    const res = await POST(makeReq(), params);
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.code).toBe("budget");
    expect(scoreDraftWithAI).not.toHaveBeenCalled();
    expect(queueRepo.update).not.toHaveBeenCalled();
  });

  it("judged=true and telemetry.judged written when the AI judge actually runs", async () => {
    vi.mocked(scoreDraftWithAI).mockResolvedValue(DRAFT_SCORE as any);
    const res = await POST(makeReq(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.judged).toBe(true);
    expect(json.degraded).toBe(false);
    // Eski bug: rescore telemetry.judged yazmıyordu → drawer "judge koşmadı" gösteriyordu.
    const scores = JSON.parse((vi.mocked(queueRepo.update).mock.calls[0][1] as { scores: string }).scores);
    expect(scores.telemetry.judged).toBe(true);
    expect(scores.judgeModel).toBe("ai");
  });

  it("degraded=true (honest heuristic) when the AI judge does not run", async () => {
    vi.mocked(scoreDraftWithAI).mockResolvedValue(null);
    const res = await POST(makeReq(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.judged).toBe(false);
    expect(json.degraded).toBe(true);
    expect(scoreDraftFallback).toHaveBeenCalled();
    const scores = JSON.parse((vi.mocked(queueRepo.update).mock.calls[0][1] as { scores: string }).scores);
    expect(scores.telemetry.judged).toBe(false);
    expect(scores.judgeModel).toBe("heuristic");
  });
});
