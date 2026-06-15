import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "./route";
import { POST as incrementUsagePOST } from "./increment-usage/route";
import { POST as adjustScorePOST } from "./adjust-score/route";
import { viralPatternRepo } from "@/lib/db/viralPatternRepo";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/db/viralPatternRepo", () => ({
  viralPatternRepo: {
    update: vi.fn(),
    findById: vi.fn(),
    incrementUsage: vi.fn(),
  },
}));

describe("Pattern Library Dynamic ID Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (method: string, body: any) => {
    return new NextRequest(`http://localhost:3000/api/growth/pattern-library/pat-123`, {
      method,
      body: JSON.stringify(body),
    });
  };

  const paramsPromise = Promise.resolve({ id: "pat-123" });

  describe("PATCH /api/growth/pattern-library/[id]", () => {
    it("successfully updates pattern details", async () => {
      vi.mocked(viralPatternRepo.update).mockResolvedValue({ id: "pat-123", patternName: "Updated Name" } as any);

      const req = createRequest("PATCH", {
        patternName: "Updated Name",
        category: "New Category",
        structureJson: '{"key":"value"}',
      });

      const res = await PATCH(req, { params: paramsPromise });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.pattern.patternName).toBe("Updated Name");

      expect(viralPatternRepo.update).toHaveBeenCalledWith("pat-123", {
        patternName: "Updated Name",
        category: "New Category",
        structureJson: { key: "value" },
      });
    });

    it("rejects empty patternName with 400 Bad Request", async () => {
      const req = createRequest("PATCH", {
        patternName: "   ",
      });

      const res = await PATCH(req, { params: paramsPromise });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("cannot be empty");
    });

    it("clamps successScore between 0-100", async () => {
      vi.mocked(viralPatternRepo.update).mockResolvedValue({ id: "pat-123", successScore: 100 } as any);

      const req1 = createRequest("PATCH", {
        successScore: 250,
      });

      const res1 = await PATCH(req1, { params: paramsPromise });
      expect(res1.status).toBe(200);
      expect(viralPatternRepo.update).toHaveBeenCalledWith("pat-123", {
        successScore: 100,
      });

      const req2 = createRequest("PATCH", {
        successScore: -50,
      });

      await PATCH(req2, { params: paramsPromise });
      expect(viralPatternRepo.update).toHaveBeenCalledWith("pat-123", {
        successScore: 0,
      });
    });

    it("rejects malformed structureJson string with 400", async () => {
      const req = createRequest("PATCH", {
        structureJson: "invalid-json-string-syntax{",
      });

      const res = await PATCH(req, { params: paramsPromise });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid structure JSON");
    });
  });

  describe("POST /api/growth/pattern-library/[id]/increment-usage", () => {
    it("triggers incrementUsage in repository", async () => {
      vi.mocked(viralPatternRepo.incrementUsage).mockResolvedValue({ id: "pat-123", usageCount: 1 } as any);

      const req = createRequest("POST", {});
      const res = await incrementUsagePOST(req, { params: paramsPromise });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.pattern.usageCount).toBe(1);
      expect(viralPatternRepo.incrementUsage).toHaveBeenCalledWith("pat-123");
    });
  });

  describe("POST /api/growth/pattern-library/[id]/adjust-score", () => {
    it("successfully adjusts score positively and clamps under 100", async () => {
      vi.mocked(viralPatternRepo.findById).mockResolvedValue({ id: "pat-123", successScore: 95 } as any);
      vi.mocked(viralPatternRepo.update).mockResolvedValue({ id: "pat-123", successScore: 100 } as any);

      const req = createRequest("POST", { delta: 10 });
      const res = await adjustScorePOST(req, { params: paramsPromise });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.pattern.successScore).toBe(100);

      expect(viralPatternRepo.findById).toHaveBeenCalledWith("pat-123");
      expect(viralPatternRepo.update).toHaveBeenCalledWith("pat-123", { successScore: 100 });
    });

    it("successfully adjusts score negatively and clamps above 0", async () => {
      vi.mocked(viralPatternRepo.findById).mockResolvedValue({ id: "pat-123", successScore: 5 } as any);
      vi.mocked(viralPatternRepo.update).mockResolvedValue({ id: "pat-123", successScore: 0 } as any);

      const req = createRequest("POST", { delta: -20 });
      const res = await adjustScorePOST(req, { params: paramsPromise });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.pattern.successScore).toBe(0);

      expect(viralPatternRepo.update).toHaveBeenCalledWith("pat-123", { successScore: 0 });
    });

    it("returns 404 if pattern to adjust score is not found", async () => {
      vi.mocked(viralPatternRepo.findById).mockResolvedValue(null);

      const req = createRequest("POST", { delta: 10 });
      const res = await adjustScorePOST(req, { params: paramsPromise });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("not found");
    });
  });
});
