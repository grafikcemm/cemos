import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/db/client";
import { igMessageRepo } from "@/lib/db/igMessageRepo";

vi.mock("@/lib/db/client", () => ({
  prisma: { igComment: { count: vi.fn() } },
}));
vi.mock("@/lib/db/igMessageRepo", () => ({
  igMessageRepo: { countNewInbound: vi.fn() },
}));

describe("GET /api/instagram/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normal yol → 200 + sayılar", async () => {
    vi.mocked(prisma.igComment.count).mockResolvedValue(3 as never);
    vi.mocked(igMessageRepo.countNewInbound).mockResolvedValue(5);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, comments: 3, dms: 5 });
  });

  it("DB hatası (pool timeout) → fail-open 200 + degraded:true", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.igComment.count).mockRejectedValue(new Error("connection pool timeout"));
    vi.mocked(igMessageRepo.countNewInbound).mockResolvedValue(0);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, comments: 0, dms: 0, degraded: true });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
