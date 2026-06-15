import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import * as vm from "@/lib/growth-engine/vector-memory";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/growth-engine/vector-memory", () => ({
  embedTrainingExample: vi.fn(),
}));

describe("POST /api/growth/vector-memory/embed-training-example", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 if exampleId is missing", async () => {
    const req = new NextRequest("http://localhost/api/growth/vector-memory/embed-training-example", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Validation error");
  });

  it("should return 200 and embedding details on success", async () => {
    vi.mocked(vm.embedTrainingExample).mockResolvedValue({
      provider: "local_fallback",
      dimensions: 256,
      values: [],
      createdAt: "2026-05-28",
    });

    const req = new NextRequest("http://localhost/api/growth/vector-memory/embed-training-example", {
      method: "POST",
      body: JSON.stringify({ exampleId: "te-123" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.embedding.provider).toBe("local_fallback");
    expect(json.embedding.dimensions).toBe(256);
  });

  it("should return 404 if training example is not found", async () => {
    vi.mocked(vm.embedTrainingExample).mockRejectedValue(new Error("TrainingExample not found."));

    const req = new NextRequest("http://localhost/api/growth/vector-memory/embed-training-example", {
      method: "POST",
      body: JSON.stringify({ exampleId: "missing-id" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("not found");
  });
});
