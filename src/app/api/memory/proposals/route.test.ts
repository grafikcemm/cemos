import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/sameOriginGuard", () => ({
  isOperatorOrCronAuthorized: vi.fn(() => true),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: { memoryFact: { findMany: vi.fn(() => Promise.resolve([])) } },
}));
vi.mock("@/lib/memory/memoryFactService", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/memory/memoryFactService")>();
  return {
    ...orig,
    approveFact: vi.fn(() => Promise.resolve()),
    rejectFact: vi.fn(() => Promise.resolve()),
    rollbackFact: vi.fn(() => Promise.resolve()),
    listProposals: vi.fn(() => Promise.resolve([{ id: "p1", statement: "x" }])),
  };
});

import { GET, POST } from "./route";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { approveFact, rollbackFact } from "@/lib/memory/memoryFactService";

function getReq(query = "") {
  return new NextRequest(`http://localhost:3000/api/memory/proposals${query}`);
}
function postReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/memory/proposals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
});

describe("/api/memory/proposals", () => {
  it("GET yetkisizse 403", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it("GET bekleyenler + aktifleri döner", async () => {
    const res = await GET(getReq());
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.proposals).toHaveLength(1);
  });

  it("POST approve servisi çağırır", async () => {
    const res = await POST(postReq({ action: "approve", factId: "p1" }));
    expect(res.status).toBe(200);
    expect(approveFact).toHaveBeenCalledWith("p1");
  });

  it("POST rollback servisi çağırır", async () => {
    await POST(postReq({ action: "rollback", factId: "f9" }));
    expect(rollbackFact).toHaveBeenCalledWith("f9");
  });

  it("POST geçersiz aksiyon 400", async () => {
    const res = await POST(postReq({ action: "delete", factId: "p1" }));
    expect(res.status).toBe(400);
  });
});
