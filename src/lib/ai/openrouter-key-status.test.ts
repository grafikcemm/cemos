import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOpenRouterKeyStatusCache,
  getOpenRouterKeyStatus,
  noteOpenRouterSpend,
} from "./openrouter-key-status";

describe("getOpenRouterKeyStatus", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    clearOpenRouterKeyStatusCache();
    vi.restoreAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("returns only sanitized budget fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              label: "must-not-leak",
              limit: 5,
              limit_remaining: 4,
              limit_reset: "monthly",
              usage_monthly: 1,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const status = await getOpenRouterKeyStatus({ force: true, nowMs: 1_000 });
    expect(status).toEqual({
      limitUsd: 5,
      limitRemainingUsd: 4,
      limitReset: "monthly",
      usageMonthlyUsd: 1,
      checkedAt: "1970-01-01T00:00:01.000Z",
    });
    expect(JSON.stringify(status)).not.toContain("must-not-leak");
  });

  it("caches the free status request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { usage_monthly: 0 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getOpenRouterKeyStatus({ nowMs: 1_000 });
    await getOpenRouterKeyStatus({ nowMs: 2_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("advances the cached usage after a billed call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { limit: 5, limit_remaining: 4, usage_monthly: 1 },
          }),
          { status: 200 },
        ),
      ),
    );
    await getOpenRouterKeyStatus({ force: true, nowMs: 1_000 });
    noteOpenRouterSpend(0.25);

    const status = await getOpenRouterKeyStatus({ nowMs: 2_000 });
    expect(status?.usageMonthlyUsd).toBe(1.3);
    expect(status?.limitRemainingUsd).toBe(3.7);
  });

  it("fails open when the read-only endpoint is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(getOpenRouterKeyStatus({ force: true })).resolves.toBeNull();
  });
});
