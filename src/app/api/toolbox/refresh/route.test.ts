import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { prisma } from "@/lib/db/client";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/db/client", () => ({
  prisma: { toolboxResource: { findMany: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

function makeReq() {
  return new NextRequest("http://localhost:3000/api/toolbox/refresh", { method: "POST" });
}

describe("POST /api/toolbox/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
    vi.mocked(prisma.toolboxResource.update).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("yetkisiz istek 403 — findMany çağrılmaz", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(prisma.toolboxResource.findMany).not.toHaveBeenCalled();
  });

  it("fail-open: bir URL patlasa bile 200 + doğru sayım", async () => {
    vi.mocked(prisma.toolboxResource.findMany).mockResolvedValue([
      { id: "a", url: "https://alive.example" },
      { id: "b", url: "https://dead.example" },
    ] as never);

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("alive")
          ? Promise.resolve({ ok: true } as Response)
          : Promise.reject(new Error("ECONNREFUSED"))
      )
    );

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.checked).toBe(2);
    expect(json.alive).toBe(1);
    expect(json.dead).toBe(1);

    // dead row persisted as linkStatus "dead", with a lastCheckedAt Date.
    const deadUpdate = vi
      .mocked(prisma.toolboxResource.update)
      .mock.calls.find((c) => c[0].where.id === "b");
    expect(deadUpdate?.[0].data.linkStatus).toBe("dead");
    expect(deadUpdate?.[0].data.lastCheckedAt).toBeInstanceOf(Date);
  });

  it("non-2xx yanıt → dead", async () => {
    vi.mocked(prisma.toolboxResource.findMany).mockResolvedValue([
      { id: "c", url: "https://notfound.example" },
    ] as never);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false } as Response)));

    const res = await POST(makeReq());
    const json = await res.json();
    expect(json.dead).toBe(1);
    expect(json.alive).toBe(0);
  });
});
