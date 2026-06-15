import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { sourceService } from "@/lib/services/sourceService";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/services/sourceService", () => ({
  sourceService: { addSource: vi.fn(), listSources: vi.fn() },
  SourceServiceError: class SourceServiceError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

function makeReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  });

  it("yetkisiz istek 403 — addSource çağrılmaz (validasyondan önce)", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq({ accountHandle: "grafikcem", handle: "testkaynak" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("forbidden");
    expect(sourceService.addSource).not.toHaveBeenCalled();
  });

  it("yetkili + geçerli body → 201", async () => {
    vi.mocked(sourceService.addSource).mockResolvedValue({ id: "s1", handle: "testkaynak" } as never);
    const res = await POST(makeReq({ accountHandle: "grafikcem", handle: "testkaynak" }));
    expect(res.status).toBe(201);
    expect(sourceService.addSource).toHaveBeenCalled();
  });
});
