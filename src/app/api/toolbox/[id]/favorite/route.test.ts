import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/db/client", () => ({
  prisma: { toolboxResource: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

function makeReq() {
  return new NextRequest("http://localhost:3000/api/toolbox/t1/favorite", { method: "POST" });
}

describe("POST /api/toolbox/[id]/favorite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  });

  it("yetkisiz istek 403 — update çağrılmaz", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
    expect(prisma.toolboxResource.update).not.toHaveBeenCalled();
  });

  it("kaynak yok → 404", async () => {
    vi.mocked(prisma.toolboxResource.findUnique).mockResolvedValue(null as never);
    const res = await POST(makeReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(404);
  });

  it("happy-path: favoriyi tersine çevirir", async () => {
    vi.mocked(prisma.toolboxResource.findUnique).mockResolvedValue({ id: "t1", isFavorite: false } as never);
    vi.mocked(prisma.toolboxResource.update).mockResolvedValue({ id: "t1", isFavorite: true } as never);

    const res = await POST(makeReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isFavorite).toBe(true);
    expect(vi.mocked(prisma.toolboxResource.update).mock.calls[0][0].data).toEqual({ isFavorite: true });
  });
});
