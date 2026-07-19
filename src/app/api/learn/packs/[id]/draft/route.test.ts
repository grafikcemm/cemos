import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));
vi.mock("@/lib/learning/learnConfig", () => ({ isLearnEnabled: vi.fn(() => true) }));
vi.mock("@/lib/learning/draftBridge", () => ({ createDraftFromLearnIdea: vi.fn() }));

import { POST } from "./route";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { isLearnEnabled } from "@/lib/learning/learnConfig";
import { createDraftFromLearnIdea } from "@/lib/learning/draftBridge";

function postReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/learn/packs/p1/draft", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: "p1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  vi.mocked(isLearnEnabled).mockReturnValue(true);
});

describe("/api/learn/packs/[id]/draft (ADR-045)", () => {
  it("yetkisiz 403 (köprü çağrılmaz)", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(postReq({ ideaId: "i1", accountHandle: "grafikcem" }), ctx);
    expect(res.status).toBe(403);
    expect(createDraftFromLearnIdea).not.toHaveBeenCalled();
  });

  it("learn kapalıysa 404", async () => {
    vi.mocked(isLearnEnabled).mockReturnValue(false);
    const res = await POST(postReq({ ideaId: "i1", accountHandle: "grafikcem" }), ctx);
    expect(res.status).toBe(404);
    expect(createDraftFromLearnIdea).not.toHaveBeenCalled();
  });

  it("geçersiz gövde 400", async () => {
    const res = await POST(postReq({ ideaId: "" }), ctx);
    expect(res.status).toBe(400);
    expect(createDraftFromLearnIdea).not.toHaveBeenCalled();
  });

  it("yeni taslak 201 + servisi doğru argümanlarla çağırır", async () => {
    vi.mocked(createDraftFromLearnIdea).mockResolvedValue({ ok: true, draftId: "q1", reused: false });
    const res = await POST(postReq({ ideaId: "i1", accountHandle: "grafikcem" }), ctx);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.draftId).toBe("q1");
    expect(json.reused).toBe(false);
    expect(createDraftFromLearnIdea).toHaveBeenCalledWith("p1", "i1", "grafikcem");
  });

  it("mevcut taslak reused → 200", async () => {
    vi.mocked(createDraftFromLearnIdea).mockResolvedValue({ ok: true, draftId: "q1", reused: true });
    const res = await POST(postReq({ ideaId: "i1", accountHandle: "grafikcem" }), ctx);
    expect(res.status).toBe(200);
  });

  it("account_not_found → 400", async () => {
    vi.mocked(createDraftFromLearnIdea).mockResolvedValue({ ok: false, code: "account_not_found" });
    const res = await POST(postReq({ ideaId: "i1", accountHandle: "x" }), ctx);
    expect(res.status).toBe(400);
  });

  it("idea_not_found → 404", async () => {
    vi.mocked(createDraftFromLearnIdea).mockResolvedValue({ ok: false, code: "idea_not_found" });
    const res = await POST(postReq({ ideaId: "i9", accountHandle: "grafikcem" }), ctx);
    expect(res.status).toBe(404);
  });
});
