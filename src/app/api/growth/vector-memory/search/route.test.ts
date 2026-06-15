import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import * as vm from "@/lib/growth-engine/vector-memory";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/growth-engine/vector-memory", () => ({
  searchSimilarExamples: vi.fn(),
}));

describe("POST /api/growth/vector-memory/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 if text query is missing", async () => {
    const req = new NextRequest("http://localhost/api/growth/vector-memory/search", {
      method: "POST",
      body: JSON.stringify({ accountHandle: "grafikcem" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("should return similar search results properly", async () => {
    const mockResults = [
      { id: "te-1", accountHandle: "grafikcem", label: "positive", sourceType: "manual", outputContent: "Winning tweet", similarity: 0.92 },
    ];
    vi.mocked(vm.searchSimilarExamples).mockResolvedValue(mockResults as any);

    const req = new NextRequest("http://localhost/api/growth/vector-memory/search", {
      method: "POST",
      body: JSON.stringify({
        accountHandle: "grafikcem",
        text: "tasarım",
        label: "positive",
        limit: 1,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.results.length).toBe(1);
    expect(json.results[0].id).toBe("te-1");
  });
});
