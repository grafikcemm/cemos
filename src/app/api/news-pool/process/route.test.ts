import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { cronRunRepo } from "@/lib/db/cronRunRepo";

vi.mock("@/lib/db/cronRunRepo", () => ({
  cronRunRepo: {
    hasRunning: vi.fn(() => Promise.resolve(false)),
    start: vi.fn(() => Promise.resolve({ id: "cr-1" })),
    finish: vi.fn(() => Promise.resolve(null)),
  },
}));

vi.mock("@/lib/news/pipeline", () => ({
  translateBatch: vi.fn(() => Promise.resolve({ processed: 0, errors: 0, remaining: 0 })),
  analyzeBatch: vi.fn(() => Promise.resolve({ processed: 0, errors: 0, remaining: 0 })),
}));

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/news-pool/process", {
    method: "POST",
    headers,
  });
}

describe("POST /api/news-pool/process — guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cronRunRepo.hasRunning).mockResolvedValue(false as never);
    vi.mocked(cronRunRepo.start).mockResolvedValue({ id: "cr-1" } as never);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("allows same-origin browser requests (Sec-Fetch-Site)", async () => {
    const res = await POST(makeReq({ "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(200);
  });

  it("allows requests whose Origin matches the request host", async () => {
    const res = await POST(makeReq({ origin: "http://localhost:3000" }));
    expect(res.status).toBe(200);
  });

  it("rejects cross-site browser requests", async () => {
    const res = await POST(
      makeReq({ "sec-fetch-site": "cross-site", origin: "https://evil.example.com" }),
    );
    expect(res.status).toBe(403);
    expect(cronRunRepo.start).not.toHaveBeenCalled();
  });

  it("rejects bare requests with no origin headers (curl)", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it("allows the CRON_SECRET bearer when configured", async () => {
    process.env.CRON_SECRET = "test-secret";
    const res = await POST(makeReq({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);
  });

  it("rejects a wrong bearer even when CRON_SECRET is configured", async () => {
    process.env.CRON_SECRET = "test-secret";
    const res = await POST(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(403);
  });

  it("still applies the advisory lock after the guard", async () => {
    vi.mocked(cronRunRepo.hasRunning).mockResolvedValue(true as never);
    const res = await POST(makeReq({ "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(409);
  });
});
