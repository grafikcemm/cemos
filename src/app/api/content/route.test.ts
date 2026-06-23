import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/content/ingestService", () => ({
  ingestContent: vi.fn(),
}));
vi.mock("@/lib/db/contentItemRepo", () => ({
  contentItemRepo: { list: vi.fn() },
}));

import { POST } from "./route";
import { ingestContent } from "@/lib/content/ingestService";

function postReq(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/content", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ingestContent).mockResolvedValue({ id: "ci-1" } as never);
});

describe("POST /api/content — SEC-01 guard", () => {
  it("rejects a cross-site/plain request with 403 and does not ingest", async () => {
    const res = await POST(postReq({ url: "https://example.com" }));
    expect(res.status).toBe(403);
    expect(ingestContent).not.toHaveBeenCalled();
  });

  it("allows a same-origin request (Sec-Fetch-Site) and ingests", async () => {
    const res = await POST(
      postReq({ url: "https://example.com" }, { "sec-fetch-site": "same-origin" }),
    );
    expect(res.status).toBe(201);
    expect(ingestContent).toHaveBeenCalledTimes(1);
  });

  it("same-origin but malformed JSON → 400 (not 500)", async () => {
    const req = new NextRequest("http://localhost:3000/api/content", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: "{bad json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(ingestContent).not.toHaveBeenCalled();
  });
});
