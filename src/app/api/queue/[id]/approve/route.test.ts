import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as approvePost } from "./route";
import { POST as rejectPost } from "../reject/route";
import { POST as markPublishedPost } from "../mark-published/route";
import { scheduleService } from "@/lib/services/scheduleService";
import { publishService } from "@/lib/services/publishService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/services/scheduleService", () => ({
  scheduleService: { approve: vi.fn(), reject: vi.fn() },
}));
vi.mock("@/lib/services/publishService", () => ({
  publishService: { markManualPublished: vi.fn() },
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

function makeReq(path: string) {
  return new NextRequest(`http://localhost:3000/api/queue/q1/${path}`, { method: "POST" });
}

function makeCtx() {
  return { params: Promise.resolve({ id: "q1" }) };
}

describe("queue mutation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  });

  describe("POST /api/queue/[id]/approve", () => {
    it("yetkisiz istek 403 — approve çağrılmaz", async () => {
      vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
      const res = await approvePost(makeReq("approve"), makeCtx() as never);
      expect(res.status).toBe(403);
      expect(scheduleService.approve).not.toHaveBeenCalled();
    });

    it("yetkili istek 200 — approve çağrılır", async () => {
      vi.mocked(scheduleService.approve).mockResolvedValue({ id: "q1", status: "approved" } as never);
      const res = await approvePost(makeReq("approve"), makeCtx() as never);
      expect(res.status).toBe(200);
      expect(scheduleService.approve).toHaveBeenCalledWith("q1");
    });
  });

  describe("POST /api/queue/[id]/reject", () => {
    it("yetkisiz istek 403 — reject çağrılmaz", async () => {
      vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
      const res = await rejectPost(makeReq("reject"), makeCtx() as never);
      expect(res.status).toBe(403);
      expect(scheduleService.reject).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/queue/[id]/mark-published", () => {
    it("yetkisiz istek 403 — markManualPublished çağrılmaz (lookup'tan önce)", async () => {
      vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
      const res = await markPublishedPost(makeReq("mark-published"), makeCtx());
      expect(res.status).toBe(403);
      expect(publishService.markManualPublished).not.toHaveBeenCalled();
    });
  });
});
