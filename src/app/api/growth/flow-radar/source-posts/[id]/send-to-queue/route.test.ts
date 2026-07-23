import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { queueRepo } from "@/lib/db/queueRepo";
import { accountRepo } from "@/lib/db/accountRepo";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";

vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { findByOriginKey: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: { findByHandle: vi.fn() },
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

function makeReq(body: unknown, id = "p1") {
  return new NextRequest(
    `http://localhost:3000/api/growth/flow-radar/source-posts/${id}/send-to-queue`,
    { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) },
  );
}
const params = (id = "p1") => ({ params: Promise.resolve({ id }) });

describe("POST send-to-queue — originKey idempotency (Phase 5B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
    vi.mocked(accountRepo.findByHandle).mockResolvedValue({ id: "acc-1", handle: "grafikcem" } as any);
    vi.mocked(queueRepo.findByOriginKey).mockResolvedValue(null);
    vi.mocked(queueRepo.create).mockResolvedValue({ id: "q1" } as any);
  });

  it("403 when unauthorized", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq({ content: "t", accountHandle: "grafikcem" }), params());
    expect(res.status).toBe(403);
    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it("400 on malformed JSON body", async () => {
    const res = await POST(makeReq("{not json"), params());
    expect(res.status).toBe(400);
    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it("404 when account not found", async () => {
    vi.mocked(accountRepo.findByHandle).mockResolvedValue(null);
    const res = await POST(makeReq({ content: "t", accountHandle: "yok" }), params());
    expect(res.status).toBe(404);
    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it("happy path → create originKey ile çağrılır, usedMock:false", async () => {
    const res = await POST(makeReq({ content: "gerçek içerik", accountHandle: "grafikcem" }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).queueItemId).toBe("q1");
    expect(queueRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-1",
        sourcePostId: "p1",
        originKey: "sourcepost-queue:p1",
        usedMock: false,
      }),
    );
  });

  it("ön-kontrol: originKey zaten kayıtlı → idempotent 200, create ÇAĞRILMAZ (duplicate yok)", async () => {
    vi.mocked(queueRepo.findByOriginKey).mockResolvedValue({ id: "q-existing" } as any);
    const res = await POST(makeReq({ content: "t", accountHandle: "grafikcem" }), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.idempotent).toBe(true);
    expect(json.queueItemId).toBe("q-existing");
    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it("yarış backstop: iki istek ön-kontrolü aynı anda geçti → create P2002 → mevcut satır idempotent döner", async () => {
    vi.mocked(queueRepo.findByOriginKey)
      .mockResolvedValueOnce(null) // ön-kontrol: henüz yok
      .mockResolvedValueOnce({ id: "q-race-winner" } as any); // P2002 sonrası: kazanan satır
    vi.mocked(queueRepo.create).mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    const res = await POST(makeReq({ content: "t", accountHandle: "grafikcem" }), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.idempotent).toBe(true);
    expect(json.queueItemId).toBe("q-race-winner");
    expect(queueRepo.findByOriginKey).toHaveBeenCalledTimes(2);
  });

  it("P2002 DIŞI create hatası → 500'e düşer (idempotent maskeleme YOK)", async () => {
    vi.mocked(queueRepo.create).mockRejectedValue(new Error("db down"));
    const res = await POST(makeReq({ content: "t", accountHandle: "grafikcem" }), params());
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("id 'none'/'undefined' → originKey üretilmez, precheck atlanır, create originKey'siz", async () => {
    const res = await POST(makeReq({ content: "t", accountHandle: "grafikcem" }, "none"), params("none"));
    expect(res.status).toBe(200);
    expect(queueRepo.findByOriginKey).not.toHaveBeenCalled();
    expect(queueRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePostId: undefined, originKey: undefined }),
    );
  });

  it("content/accountHandle yoksa → placeholder yanıtı, hiçbir repo çağrısı yok", async () => {
    const res = await POST(makeReq({}), params());
    expect(res.status).toBe(200);
    expect((await res.json()).placeholder).toBe(true);
    expect(accountRepo.findByHandle).not.toHaveBeenCalled();
    expect(queueRepo.create).not.toHaveBeenCalled();
  });
});
