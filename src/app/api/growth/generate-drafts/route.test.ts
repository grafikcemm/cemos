import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/growth-engine/draft-generator", () => ({
  generateDrafts: vi.fn((input: any) => {
    return Promise.resolve({
      success: true,
      context: {
        accountProfile: { handle: input.accountHandle },
        actionType: input.actionType,
      },
      drafts: [
        {
          draft: {
            id: "draft-1",
            content: "Mocked generated draft text",
            angle: "safe",
            actionType: input.actionType,
            accountHandle: input.accountHandle,
            reasoning: "Mock reasoning",
          },
          critic: {
            personaMatchScore: 85,
            hookStrengthScore: 80,
            clarityScore: 90,
            viralityScore: 78,
            noveltyScore: 82,
            riskScore: 15,
            publishScore: 84,
            publishRecommendation: "publish",
            rewriteSuggestion: "",
            reason: "Passed criteria",
            confidence: 85,
          },
        },
      ],
      warnings: [],
    });
  }),
}));

describe("POST /api/growth/generate-drafts API Route", () => {
  const makeRequest = (body: any) => {
    return new NextRequest("http://localhost:3000/api/growth/generate-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  it("should successfully generate drafts with valid input", async () => {
    const req = makeRequest({
      accountHandle: "grafikcem",
      actionType: "tweet",
      sourceContent: "Valid input content",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.drafts.length).toBe(1);
    expect(data.drafts[0].draft.content).toBe("Mocked generated draft text");
    expect(data.drafts[0].critic.publishScore).toBe(84);
  });

  it("should return 400 if accountHandle is missing or invalid", async () => {
    const req = makeRequest({
      actionType: "tweet",
      sourceContent: "Content is here",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid or missing accountHandle");
  });

  it("should return 400 if actionType is missing or invalid", async () => {
    const req = makeRequest({
      accountHandle: "grafikcem",
      actionType: "invalid-action",
      sourceContent: "Content is here",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid or missing actionType");
  });

  it("should return 400 if no content is provided at all", async () => {
    const req = makeRequest({
      accountHandle: "grafikcem",
      actionType: "tweet",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("At least one content source");
  });
});
