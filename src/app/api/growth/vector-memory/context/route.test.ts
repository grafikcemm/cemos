import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import * as vm from "@/lib/growth-engine/vector-memory";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/growth-engine/vector-memory", () => ({
  buildMemoryContext: vi.fn(),
  buildMemoryPromptBlock: vi.fn(),
}));

describe("POST /api/growth/vector-memory/context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 if all content inputs are empty", async () => {
    const req = new NextRequest("http://localhost/api/growth/vector-memory/context", {
      method: "POST",
      body: JSON.stringify({ accountHandle: "grafikcem" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("should return compiled memoryContext and promptBlock on valid request", async () => {
    const mockContext = {
      positiveExamples: [],
      negativeExamples: [],
      editedExamples: [],
      patternExamples: [],
      warnings: [],
    };
    vi.mocked(vm.buildMemoryContext).mockResolvedValue(mockContext as any);
    vi.mocked(vm.buildMemoryPromptBlock).mockReturnValue("=== MEMORY BLOCK ===");

    const req = new NextRequest("http://localhost/api/growth/vector-memory/context", {
      method: "POST",
      body: JSON.stringify({
        accountHandle: "grafikcem",
        sourceContent: "AI news content",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.promptBlock).toBe("=== MEMORY BLOCK ===");
  });
});
