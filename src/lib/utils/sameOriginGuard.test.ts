import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { isSameOriginRequest, isOperatorOrCronAuthorized } from "./sameOriginGuard";

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/test", {
    method: "POST",
    headers,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isSameOriginRequest", () => {
  it("sec-fetch-site: same-origin → true", () => {
    expect(isSameOriginRequest(makeReq({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("sec-fetch-site: same-site → true", () => {
    expect(isSameOriginRequest(makeReq({ "sec-fetch-site": "same-site" }))).toBe(true);
  });

  it("sec-fetch-site: cross-site + origin yok → false", () => {
    expect(isSameOriginRequest(makeReq({ "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("dış Origin (evil.example) → false", () => {
    expect(isSameOriginRequest(makeReq({ origin: "https://evil.example" }))).toBe(false);
  });

  it("Origin host'u istek host'uyla eşleşiyor → true", () => {
    expect(isSameOriginRequest(makeReq({ origin: "http://localhost:3000" }))).toBe(true);
  });

  it("header hiç yok → false", () => {
    expect(isSameOriginRequest(makeReq())).toBe(false);
  });

  it("x-forwarded-host eşleşmesi (Vercel) → true", () => {
    const req = makeReq({
      origin: "https://app.example.com",
      "x-forwarded-host": "app.example.com",
    });
    expect(isSameOriginRequest(req)).toBe(true);
  });

  it("x-forwarded-host farklı → false", () => {
    const req = makeReq({
      origin: "https://evil.example",
      "x-forwarded-host": "app.example.com",
    });
    expect(isSameOriginRequest(req)).toBe(false);
  });

  it("bozuk Origin URL → false (catch yolu)", () => {
    expect(isSameOriginRequest(makeReq({ origin: "not-a-url" }))).toBe(false);
  });
});

describe("isOperatorOrCronAuthorized", () => {
  it("CRON_SECRET set + doğru Bearer → true (cross-origin olsa bile)", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const req = makeReq({ authorization: "Bearer s3cret", origin: "https://evil.example" });
    expect(isOperatorOrCronAuthorized(req)).toBe(true);
  });

  it("CRON_SECRET set + yanlış Bearer + cross-origin → false", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const req = makeReq({ authorization: "Bearer wrong", origin: "https://evil.example" });
    expect(isOperatorOrCronAuthorized(req)).toBe(false);
  });

  it("CRON_SECRET set + yanlış Bearer ama same-origin → true (fallback)", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const req = makeReq({ authorization: "Bearer wrong", "sec-fetch-site": "same-origin" });
    expect(isOperatorOrCronAuthorized(req)).toBe(true);
  });

  it("CRON_SECRET yok + cross-origin → false (cron bypass devre dışı)", () => {
    vi.stubEnv("CRON_SECRET", "");
    const req = makeReq({ origin: "https://evil.example" });
    expect(isOperatorOrCronAuthorized(req)).toBe(false);
  });

  it("CRON_SECRET yok + same-origin → true", () => {
    vi.stubEnv("CRON_SECRET", "");
    const req = makeReq({ "sec-fetch-site": "same-origin" });
    expect(isOperatorOrCronAuthorized(req)).toBe(true);
  });
});
