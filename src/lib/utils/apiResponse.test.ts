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
