import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));
const getById = vi.fn();
const setStatus = vi.fn();
vi.mock("@/lib/db/ideaRepo", () => ({
  ideaRepo: { getById: (...a: unknown[]) => getById(...a), setStatus: (...a: unknown[]) => setStatus(...a) },
}));
const findByOriginKey = vi.fn();
const create = vi.fn();
vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { findByOriginKey: (...a: unknown[]) => findByOriginKey(...a), create: (...a: unknown[]) => create(...a) },
}));

import { POST } from "./route";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

function req() {
  return new NextRequest("http://localhost:3000/api/ideas/idea-1/create-draft", { method: "POST" });
}
const ctx = { params: Promise.resolve({ id: "idea-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
  getById.mockResolvedValue({
    id: "idea-1",
    accountId: "acc-1",
    platform: "x",
    hook: "Hook",
    bodyOutline: "Outline",
    title: "T",
    angle: "A",
    transformationType: "manual",
  });
  findByOriginKey.mockResolvedValue(null);
  create.mockResolvedValue({ id: "q-new" });
  setStatus.mockResolvedValue(undefined);
});

describe("POST /api/ideas/[id]/create-draft (ADR-045 idempotency)", () => {
  it("yetkisiz 403", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    expect((await POST(req(), ctx)).status).toBe(403);
  });

  it("idea yoksa 404", async () => {
    getById.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(404);
  });

  it("yeni taslak: originKey=idea:{id}, 201, idea drafted", async () => {
    const res = await POST(req(), ctx);
    expect(res.status).toBe(201);
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.originKey).toBe("idea:idea-1");
    expect(setStatus).toHaveBeenCalledWith("idea-1", "drafted");
    expect((await res.json()).reused).toBe(false);
  });

  it("çift-tık: mevcut originKey → reused, create ÇAĞRILMAZ (duplicate yok)", async () => {
    findByOriginKey.mockResolvedValue({ id: "q-existing" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).reused).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("yarış: create P2002 → mevcut taslak reused (200, 500 değil)", async () => {
    findByOriginKey.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "q-raced" });
    create.mockRejectedValue({ code: "P2002" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).reused).toBe(true);
  });
});
