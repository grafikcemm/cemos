import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/sameOriginGuard", () => ({
  isOperatorOrCronAuthorized: vi.fn(() => true),
}));
vi.mock("@/lib/memory/signalBridge", () => ({
  setFeedbackSignalNeutralized: vi.fn(),
}));

import { POST } from "./route";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { setFeedbackSignalNeutralized } from "@/lib/memory/signalBridge";

function postReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/memory/signals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(true);
});

describe("/api/memory/signals (ADR-045 — sinyal etkisizleştir)", () => {
  it("yetkisizse 403 (mutasyon yok)", async () => {
    vi.mocked(isOperatorOrCronAuthorized).mockReturnValue(false);
    const res = await POST(postReq({ accountHandle: "grafikcem", id: "fe-1", action: "neutralize" }));
    expect(res.status).toBe(403);
    expect(setFeedbackSignalNeutralized).not.toHaveBeenCalled();
  });

  it("geçersiz action → 400", async () => {
    const res = await POST(postReq({ accountHandle: "grafikcem", id: "fe-1", action: "delete" }));
    expect(res.status).toBe(400);
    expect(setFeedbackSignalNeutralized).not.toHaveBeenCalled();
  });

  it("eksik alan → 400", async () => {
    const res = await POST(postReq({ id: "fe-1", action: "neutralize" }));
    expect(res.status).toBe(400);
  });

  it("neutralize → servisi doğru argümanlarla çağırır, 200", async () => {
    vi.mocked(setFeedbackSignalNeutralized).mockResolvedValue({ ok: true, id: "fe-1", neutralized: true });
    const res = await POST(postReq({ accountHandle: "grafikcem", id: "fe-1", action: "neutralize" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.neutralized).toBe(true);
    expect(setFeedbackSignalNeutralized).toHaveBeenCalledWith("grafikcem", "fe-1", true);
  });

  it("restore → action=restore servise false geçer", async () => {
    vi.mocked(setFeedbackSignalNeutralized).mockResolvedValue({ ok: true, id: "fe-1", neutralized: false });
    const res = await POST(postReq({ accountHandle: "grafikcem", id: "fe-1", action: "restore" }));
    expect(res.status).toBe(200);
    expect(setFeedbackSignalNeutralized).toHaveBeenCalledWith("grafikcem", "fe-1", false);
  });

  it("not_found → 404", async () => {
    vi.mocked(setFeedbackSignalNeutralized).mockResolvedValue({ ok: false, code: "not_found" });
    const res = await POST(postReq({ accountHandle: "grafikcem", id: "fe-x", action: "neutralize" }));
    expect(res.status).toBe(404);
  });

  it("account_mismatch → 403 (cross-account fail-closed)", async () => {
    vi.mocked(setFeedbackSignalNeutralized).mockResolvedValue({ ok: false, code: "account_mismatch" });
    const res = await POST(postReq({ accountHandle: "grafikcem", id: "fe-1", action: "neutralize" }));
    expect(res.status).toBe(403);
  });
});
