import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchTranscriptViaSupadata } from "./supadata";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchTranscriptViaSupadata", () => {
  it("maps Supadata segments (offset/duration ms → sec) into a TranscriptResult", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            lang: "tr",
            content: [
              { text: "Merhaba ", offset: 1500, duration: 2000 },
              { text: "dünya", offset: 3500, duration: 1000 },
            ],
          })
        )
      )
    );

    const tr = await fetchTranscriptViaSupadata("abcdefghijk");

    expect(tr).not.toBeNull();
    expect(tr!.provider).toBe("supadata");
    expect(tr!.lang).toBe("tr");
    expect(tr!.segments).toEqual([
      { startSec: 1.5, endSec: 3.5, text: "Merhaba" },
      { startSec: 3.5, endSec: 4.5, text: "dünya" },
    ]);
    expect(tr!.fullText).toBe("Merhaba dünya");
  });

  it("returns null and never calls fetch when the API key is missing", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await fetchTranscriptViaSupadata("abcdefghijk")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null on a non-2xx response (e.g. 429 quota)", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, false, 429))));

    expect(await fetchTranscriptViaSupadata("abcdefghijk")).toBeNull();
  });

  it("returns null when content is empty / async-job (no segments)", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ lang: "en", content: [] }))));

    expect(await fetchTranscriptViaSupadata("abcdefghijk")).toBeNull();
  });

  it("returns null (never throws) when fetch rejects", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    expect(await fetchTranscriptViaSupadata("abcdefghijk")).toBeNull();
  });

  it("returns null for an empty videoId without calling fetch", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await fetchTranscriptViaSupadata("")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── Uzun video async-job (202 + jobId) senaryoları ──

  it("polls the async job on 202 and returns segments when the job completes", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    const fetchSpy = vi
      .fn()
      // İlk çağrı: 202 + jobId
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1" }, false, 202))
      // 1. poll: hâlâ kuyruğa alınmış
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      // 2. poll: tamamlandı + içerik
      .mockResolvedValueOnce(
        jsonResponse({
          status: "completed",
          lang: "en",
          content: [{ text: "long video text", offset: 0, duration: 1000 }],
        })
      );
    vi.stubGlobal("fetch", fetchSpy);

    const promise = fetchTranscriptViaSupadata("longvideo01");
    await vi.advanceTimersByTimeAsync(10_000);
    const tr = await promise;

    expect(tr).not.toBeNull();
    expect(tr!.provider).toBe("supadata");
    expect(tr!.fullText).toBe("long video text");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[1][0])).toContain("/v1/transcript/job-1");
    vi.useRealTimers();
  });

  it("returns null when the async job reports failed", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-2" }, false, 202))
      .mockResolvedValueOnce(jsonResponse({ status: "failed" }));
    vi.stubGlobal("fetch", fetchSpy);

    const promise = fetchTranscriptViaSupadata("longvideo02");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toBeNull();
    vi.useRealTimers();
  });

  it("returns null when the async job never completes within the poll budget", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-3" }, false, 202))
      .mockResolvedValue(jsonResponse({ status: "active" }));
    vi.stubGlobal("fetch", fetchSpy);

    const promise = fetchTranscriptViaSupadata("longvideo03");
    await vi.advanceTimersByTimeAsync(120_000); // 90s bütçenin üstü
    expect(await promise).toBeNull();
    vi.useRealTimers();
  });

  it("returns null on 202 without a jobId", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, false, 202))));

    expect(await fetchTranscriptViaSupadata("longvideo04")).toBeNull();
  });
});
