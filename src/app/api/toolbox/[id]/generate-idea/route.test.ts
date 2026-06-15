import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { prisma } from "@/lib/db/client";
import { draftService } from "@/lib/services/draftService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/db/client", () => ({
  prisma: { toolboxResource: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/services/draftService", () => ({
  draftService: { generateDraft: vi.fn() },
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

const RESOURCE = {
  id: "t1",
  title: "Figma",
  description: "Tasarım aracı",
  whyUseful: "Mockup üretir",
  useCase: "Mockup",
  url: "https://figma.com",
};

function makeReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/toolbox/t1/generate-idea", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/toolbox/[id]/generate-idea", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  });

  it("yetkisiz istek 403 — lookup ve generateDraft çağrılmaz", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq({ account: "grafikcem" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(prisma.toolboxResource.findUnique).not.toHaveBeenCalled();
    expect(draftService.generateDraft).not.toHaveBeenCalled();
  });

  it("geçersiz account → 400", async () => {
    const res = await POST(makeReq({ account: "nope" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(400);
    expect(draftService.generateDraft).not.toHaveBeenCalled();
  });

  it("kaynak yok → 404", async () => {
    vi.mocked(prisma.toolboxResource.findUnique).mockResolvedValue(null as never);
    const res = await POST(makeReq({ account: "grafikcem" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(404);
  });

  it("happy-path: grounding üretir, kuyruğa düşer", async () => {
    vi.mocked(prisma.toolboxResource.findUnique).mockResolvedValue(RESOURCE as never);
    vi.mocked(draftService.generateDraft).mockResolvedValue({ generated: "taslak" } as never);

    const res = await POST(makeReq({ account: "maskulenkod" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const arg = vi.mocked(draftService.generateDraft).mock.calls[0][0];
    expect(arg.accountHandle).toBe("maskulenkod");
    expect(arg.sourceHandle).toBe("toolbox");
    expect(arg.sourceTweet).toContain("Figma");
    expect(arg.sourceTweet).toContain("https://figma.com");
  });

  it("blocked → 200 success:false blocked:true", async () => {
    vi.mocked(prisma.toolboxResource.findUnique).mockResolvedValue(RESOURCE as never);
    vi.mocked(draftService.generateDraft).mockResolvedValue({ blocked: true, reason: "budget" } as never);

    const res = await POST(makeReq({ account: "grafikcem" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.blocked).toBe(true);
    expect(json.reason).toBe("budget");
  });
});
