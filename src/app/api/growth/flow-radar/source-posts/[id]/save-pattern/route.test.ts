import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { prisma } from "@/lib/db/client";
import { processFeedback } from "@/lib/growth-engine/feedback-service";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/db/client", () => ({
  // M9 fix: check-then-act yerine ATOMİK claim → updateMany (update DEĞİL).
  prisma: { sourcePost: { findUnique: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/lib/growth-engine/feedback-service", () => ({ processFeedback: vi.fn() }));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

function makeReq() {
  return new NextRequest(
    "http://localhost:3000/api/growth/flow-radar/source-posts/p1/save-pattern",
    { method: "POST" },
  );
}
const params = { params: Promise.resolve({ id: "p1" }) };

describe("POST save-pattern — Phase 5A idempotency guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
    vi.mocked(processFeedback).mockResolvedValue({ success: true, viralPatternId: "vp-1" } as any);
    vi.mocked(prisma.sourcePost.updateMany).mockResolvedValue({ count: 1 } as any); // claim kazanır
  });

  it("fresh (status=new) post → atomik claim kazanır, extracts once, marks it used", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({
      id: "p1", accountId: "acc-1", text: "hook", status: "new", account: { handle: "grafikcem" },
    } as any);
    const res = await POST(makeReq(), params);
    expect(res.status).toBe(200);
    expect(processFeedback).toHaveBeenCalledTimes(1);
    // Atomik claim: yalnız HENÜZ used olmayanı used'a çevirir (ücretli çağrıdan ÖNCE).
    expect(prisma.sourcePost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", status: { not: "used" } }, data: { status: "used" } }),
    );
  });

  it("yarış: findUnique 'new' gördü ama claim (updateMany) count=0 → idempotent no-op, ücretli çağrı YOK", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({
      id: "p1", accountId: "acc-1", text: "hook", status: "new", account: { handle: "grafikcem" },
    } as any);
    vi.mocked(prisma.sourcePost.updateMany).mockResolvedValue({ count: 0 } as any); // başka istek kaptı
    const res = await POST(makeReq(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).alreadySaved).toBe(true);
    expect(processFeedback).not.toHaveBeenCalled(); // çift-ücret YOK
  });

  it("already-used post → idempotent no-op, NO second paid extraction, NO duplicate write", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue({
      id: "p1", accountId: "acc-1", text: "hook", status: "used", account: { handle: "grafikcem" },
    } as any);
    const res = await POST(makeReq(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadySaved).toBe(true);
    expect(processFeedback).not.toHaveBeenCalled();
    expect(prisma.sourcePost.updateMany).not.toHaveBeenCalled(); // used → claim'e bile gitmez
  });

  it("404 when the source post does not exist", async () => {
    vi.mocked(prisma.sourcePost.findUnique).mockResolvedValue(null);
    const res = await POST(makeReq(), params);
    expect(res.status).toBe(404);
    expect(processFeedback).not.toHaveBeenCalled();
  });
});
