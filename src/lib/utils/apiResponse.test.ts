import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { ok, fail, parseJsonBody } from "./apiResponse";

function makeReq(body: string) {
  return new NextRequest("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("apiResponse helpers", () => {
  it("ok() wraps payload with success:true", async () => {
    const res = ok({ items: [1, 2] }, { status: 201 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, items: [1, 2] });
  });

  it("fail() wraps error with success:false + extra", async () => {
    const res = fail("Yetkisiz", 403, { code: "forbidden" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: "Yetkisiz", code: "forbidden" });
  });

  it("fail() redacts secret patterns in the error message (SEC choke-point)", async () => {
    const json = (await fail("connect: postgresql://u:pw@h.neon.tech/db + key sk-abcdef123456", 500).json()) as { error: string };
    expect(json.error).not.toContain("pw@h.neon.tech");
    expect(json.error).toContain("[REDACTED]");
    expect(json.error).toContain("[REDACTED_KEY]");
    const bearer = (await fail("auth Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig failed", 500).json()) as { error: string };
    expect(bearer.error).toContain("Bearer [REDACTED]");
  });

  it("fail() bounds 5xx bodies but preserves short 4xx messages", async () => {
    const long = "x".repeat(500);
    const r500 = (await fail(long, 500).json()) as { error: string };
    expect(r500.error.length).toBeLessThanOrEqual(302); // 300 + "…"
    const r400 = (await fail("Geçersiz alan", 400).json()) as { error: string };
    expect(r400.error).toBe("Geçersiz alan"); // 4xx kısa mesaj değişmez
  });

  it("parseJsonBody returns ok:true for valid JSON", async () => {
    const parsed = await parseJsonBody(makeReq(JSON.stringify({ a: 1 })));
    expect(parsed).toEqual({ ok: true, data: { a: 1 } });
  });

  it("parseJsonBody returns ok:false for malformed JSON (no throw → 400 path)", async () => {
    const parsed = await parseJsonBody(makeReq("{bad json"));
    expect(parsed).toEqual({ ok: false });
  });

  it("parseJsonBody treats empty body as {} (optional-body routes)", async () => {
    const parsed = await parseJsonBody(makeReq(""));
    expect(parsed).toEqual({ ok: true, data: {} });
  });
});
