import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import * as vm from "@/lib/growth-engine/vector-memory";
import { accountRepo } from "@/lib/db/accountRepo";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/growth-engine/vector-memory", () => ({
  embedTrainingExamplesByAccount: vi.fn(),
}));

vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: {
    findByHandle: vi.fn(),
  },
}));

describe("POST /api/growth/vector-memory/embed-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 for invalid accountHandle", async () => {
    const req = new NextRequest("http://localhost/api/growth/vector-memory/embed-account", {
      method: "POST",
      body: JSON.stringify({ accountHandle: "invalid_handle" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Validation error");
  });

  it("should return 200 on successful bulk embedding", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue({ id: "acc-1", handle: "grafikcem" } as any);
    vi.mocked(vm.embedTrainingExamplesByAccount).mockResolvedValue({
      embedded: 5,
      skipped: 2,
      failed: 0,
    });

    const req = new NextRequest("http://localhost/api/growth/vector-memory/embed-account", {
      method: "POST",
      body: JSON.stringify({ accountHandle: "grafikcem" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.embedded).toBe(5);
    expect(json.skipped).toBe(2);
    expect(json.failed).toBe(0);
  });
});
