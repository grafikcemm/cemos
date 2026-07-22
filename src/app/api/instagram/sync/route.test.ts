import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/sameOriginGuard", () => ({
  isOperatorOrCronAuthorized: vi.fn(),
}));
vi.mock("@/lib/instagram/bridgeSyncService", () => ({
  syncInstagramViaBridge: vi.fn(),
}));

import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { syncInstagramViaBridge } from "@/lib/instagram/bridgeSyncService";
import { POST } from "@/app/api/instagram/sync/route";

function makeReq() {
  return new NextRequest("http://localhost/api/instagram/sync", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
});

describe("POST /api/instagram/sync", () => {
  it("yetkisiz istek 403 (mevcut auth sözleşmesi)", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(syncInstagramViaBridge).not.toHaveBeenCalled();
  });

  it("bounded read-only sync sonucu döner; secret/credential içermez", async () => {
    vi.mocked(syncInstagramViaBridge).mockResolvedValue({
      ok: true,
      provider: "composio",
      mode: "auto",
      fallbackUsed: false,
      connectionState: "connected",
      accountHandle: "grafikcem",
      boundAccountId: "acc-1",
      externalUsername: "grafikcem",
      mediaFetched: 5,
      mediaUpserted: 5,
      commentsFetched: 12,
      commentsUpserted: 12,
      insightCaptured: true,
      contentBridged: 5,
      toolkitVersion: "20260708_00",
      warnings: [],
    } as never);
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.result.mediaUpserted).toBe(5);
    const raw = JSON.stringify(json);
    expect(raw).not.toMatch(/api[_-]?key|access[_-]?token|x-consumer/i);
  });

  it("endpoint generic tool executor DEĞİL: body/tool parametresi kabul etmez", async () => {
    vi.mocked(syncInstagramViaBridge).mockResolvedValue({ ok: false, warnings: [] } as never);
    await POST(
      new NextRequest("http://localhost/api/instagram/sync", {
        method: "POST",
        body: JSON.stringify({ tool: "INSTAGRAM_MEDIA_PUBLISH", args: { evil: true } }),
      })
    );
    // gövde tamamen yok sayılır — sync parametresiz çağrılır
    expect(syncInstagramViaBridge).toHaveBeenCalledWith();
  });

  it("servis hatası 500 + mesaj (stack/secret yok)", async () => {
    vi.mocked(syncInstagramViaBridge).mockRejectedValue(new Error("beklenmedik"));
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("beklenmedik");
  });
});
