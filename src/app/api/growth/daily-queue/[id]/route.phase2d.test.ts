import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Phase 2D (ADR-033) — PATCH /api/growth/daily-queue/[id] segment kaydı:
 * server Zod doğrulaması + segment↔editedContent atomik senkronu.
 */

vi.mock("@/lib/utils/sameOriginGuard", () => ({
  isOperatorOrCronAuthorized: vi.fn(() => true),
}));
vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: { findById: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));

import { PATCH } from "./route";
import { queueRepo } from "@/lib/db/queueRepo";

const T_SEGS = [{ text: "Hook segmenti." }, { text: "İkinci segment." }];

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/growth/daily-queue/qi_t", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const params = { params: Promise.resolve({ id: "qi_t" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queueRepo.findById).mockResolvedValue({
    id: "qi_t",
    status: "new",
    draftType: "THREAD",
    mode: "thread",
    content: "orijinal birleşik içerik",
    editedContent: null,
    scheduledAt: null,
  } as never);
  vi.mocked(queueRepo.update).mockImplementation(async (_id, data) => ({ id: "qi_t", ...data }) as never);
});

describe("PATCH threadSegments — Phase 2D", () => {
  it("geçerli segment kaydı: threadSegments + editedContent(canonical birleşim) AYNI update'te; content korunur", async () => {
    const res = await PATCH(req({ threadSegments: JSON.stringify(T_SEGS) }), params);
    expect(res.status).toBe(200);
    expect(queueRepo.update).toHaveBeenCalledTimes(1);
    const data = vi.mocked(queueRepo.update).mock.calls[0][1];
    expect(JSON.parse(data.threadSegments as string)).toEqual(T_SEGS);
    expect(data.editedContent).toBe("Hook segmenti.\n\nİkinci segment.");
    expect(data).not.toHaveProperty("content"); // generated original korunur
  });

  it("boş segment içeren payload → 400, hiçbir yazma yok", async () => {
    const res = await PATCH(
      req({ threadSegments: JSON.stringify([{ text: "dolu" }, { text: "   " }]) }),
      params
    );
    expect(res.status).toBe(400);
    expect(queueRepo.update).not.toHaveBeenCalled();
  });

  it("geçersiz JSON segment payload'ı → 400", async () => {
    const res = await PATCH(req({ threadSegments: "bozuk json" }), params);
    expect(res.status).toBe(400);
    expect(queueRepo.update).not.toHaveBeenCalled();
  });

  it("aynı payload tekrar kaydı idempotent (aynı serialize sonucu, hata yok)", async () => {
    const body = { threadSegments: JSON.stringify(T_SEGS) };
    const r1 = await PATCH(req(body), params);
    const r2 = await PATCH(req(body), params);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const d1 = vi.mocked(queueRepo.update).mock.calls[0][1];
    const d2 = vi.mocked(queueRepo.update).mock.calls[1][1];
    expect(d1.threadSegments).toBe(d2.threadSegments);
    expect(d1.editedContent).toBe(d2.editedContent);
  });

  it("non-thread taslakta segment kaydı editedContent'i EZMEZ (yalnız segment alanı yazılır)", async () => {
    vi.mocked(queueRepo.findById).mockResolvedValue({
      id: "qi_1",
      status: "new",
      draftType: "TWEET",
      mode: "ai_news",
      content: "tweet",
      editedContent: null,
      scheduledAt: null,
    } as never);
    const res = await PATCH(req({ threadSegments: JSON.stringify(T_SEGS) }), params);
    expect(res.status).toBe(200);
    const data = vi.mocked(queueRepo.update).mock.calls[0][1];
    expect(data).not.toHaveProperty("editedContent");
  });

  it("yayınlanmış taslak değiştirilemez (mevcut sözleşme korunur)", async () => {
    vi.mocked(queueRepo.findById).mockResolvedValue({
      id: "qi_t", status: "manual_published", draftType: "THREAD", mode: "thread",
      content: "x", editedContent: null, scheduledAt: null,
    } as never);
    const res = await PATCH(req({ threadSegments: JSON.stringify(T_SEGS) }), params);
    expect(res.status).toBe(400);
  });
});
