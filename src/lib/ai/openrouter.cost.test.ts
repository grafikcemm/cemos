import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateJson } from "./openrouter";

function completion(content: string, cost: number): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("OpenRouter cost controls", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("forwards the provider max_price ceiling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('{"ok":true}', 0.001));
    vi.stubGlobal("fetch", fetchMock);

    await generateJson<{ ok: boolean }>({
      role: "cheapWriter",
      model: "deepseek/deepseek-v4-flash",
      fallbacks: [],
      system: "s",
      user: "u",
      maxPrice: { prompt: 0.12, completion: 0.25 },
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { provider?: { max_price?: unknown } };
    expect(body.provider?.max_price).toEqual({ prompt: 0.12, completion: 0.25 });
    expect(body).not.toHaveProperty("usage");
  });

  it("includes billed invalid-JSON attempts in the returned real cost", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(completion("not-json", 0.01))
        .mockResolvedValueOnce(completion('{"ok":true}', 0.02)),
    );

    const result = await generateJson<{ ok: boolean }>({
      role: "cheapWriter",
      model: "deepseek/deepseek-v4-flash",
      fallbacks: [],
      system: "s",
      user: "u",
    });

    expect(result.data.ok).toBe(true);
    expect(result.actualCostUsd).toBeCloseTo(0.03);
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(40);
  });
});
