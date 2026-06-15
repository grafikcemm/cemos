import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson, FetchJsonError } from "./safeFetch";

function stubFetch(status: number, body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(body, {
          status,
        })
      )
    )
  );
}

describe("fetchJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on 2xx", async () => {
    stubFetch(200, JSON.stringify({ success: true, value: 42 }));
    const data = await fetchJson<{ success: boolean; value: number }>("/api/x");
    expect(data).toEqual({ success: true, value: 42 });
  });

  it("throws FetchJsonError with status + preview on a plain-text 504 (Vercel timeout page)", async () => {
    stubFetch(504, "An error occurred with your deployment. FUNCTION_INVOCATION_TIMEOUT");
    const err = (await fetchJson("/api/x").catch((e) => e)) as FetchJsonError;
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.status).toBe(504);
    expect(err.message).toContain("Sunucu hatası (504)");
    expect(err.message).toContain("An error occurred");
  });

  it("prefers the API's own error message when the error body IS json", async () => {
    stubFetch(500, JSON.stringify({ success: false, error: "Madencilik hatası" }));
    const err = (await fetchJson("/api/x").catch((e) => e)) as FetchJsonError;
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.message).toBe("Sunucu hatası (500): Madencilik hatası");
  });

  it("throws a 'JSON değil' error for 200 responses with non-JSON bodies", async () => {
    stubFetch(200, "<html>oops</html>");
    const err = (await fetchJson("/api/x").catch((e) => e)) as FetchJsonError;
    expect(err).toBeInstanceOf(FetchJsonError);
    expect(err.message).toContain("JSON değil");
    expect(err.bodyPreview).toContain("<html>oops</html>");
  });

  it("propagates network-level rejections untouched", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(fetchJson("/api/x")).rejects.toThrow("Failed to fetch");
  });
});
