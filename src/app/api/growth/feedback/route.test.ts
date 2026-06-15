import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { NextRequest } from "next/server";
import { ZodError } from "zod";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/growth-engine/feedback-service", () => ({
  processFeedback: vi.fn(),
}));

describe("Feedback API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: any) => {
    return new NextRequest("http://localhost:3000/api/growth/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    });
  };

  it("returns 200 and JSON payload on successful processing", async () => {
    const mockResponse = {
      success: true,
      feedbackEventId: "evt-123",
      trainingExampleId: "te-123",
    };
    vi.mocked(processFeedback).mockResolvedValue(mockResponse);

    const req = createRequest({
      accountId: "acc-1",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Content",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual(mockResponse);
    expect(processFeedback).toHaveBeenCalled();
  });

  it("returns 400 Bad Request on Zod validation errors", async () => {
    const zodError = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["accountId"],
        message: "accountId required",
      },
    ]);
    vi.mocked(processFeedback).mockRejectedValue(zodError);

    const req = createRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Validation failed");
    expect(json.details).toBeDefined();
  });

  it("returns 400 Bad Request for explicit business rule errors (invalid handle)", async () => {
    vi.mocked(processFeedback).mockRejectedValue(new Error("Invalid accountHandle: bad_handle"));

    const req = createRequest({
      accountId: "acc-1",
      accountHandle: "bad_handle",
      feedbackType: "approved",
      originalContent: "Content",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Invalid accountHandle: bad_handle");
  });

  it("returns 400 Bad Request for explicit business rule errors (no content)", async () => {
    vi.mocked(processFeedback).mockRejectedValue(new Error("No content provided in feedback input"));

    const req = createRequest({
      accountId: "acc-1",
      accountHandle: "grafikcem",
      feedbackType: "approved",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("No content provided in feedback input");
  });

  it("returns 500 Internal Server Error for unexpected database/system errors", async () => {
    vi.mocked(processFeedback).mockRejectedValue(new Error("Database connection timed out"));

    const req = createRequest({
      accountId: "acc-1",
      accountHandle: "grafikcem",
      feedbackType: "approved",
      originalContent: "Content",
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Database connection timed out");
  });
});
