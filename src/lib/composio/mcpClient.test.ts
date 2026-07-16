import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ComposioMcpClient,
  ComposioBridgeError,
  parseSseForResponse,
  redactSecrets,
} from "@/lib/composio/mcpClient";
import { evaluateToolPolicy, INSTAGRAM_READ_TOOL_ALLOWLIST } from "@/lib/composio/allowlist";
import { getComposioConfig, missingComposioEnvNames } from "@/lib/composio/config";

const ENDPOINT = "https://connect.composio.dev/mcp";

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

/** initialize + notifications/initialized + tools/list zincirini karşılayan fetch. */
function makeFetchScript(handlers: Array<(url: string, init: RequestInit) => Response | Promise<Response>>) {
  let call = 0;
  const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const h = handlers[Math.min(call, handlers.length - 1)];
    call++;
    return h(String(url), init ?? {});
  });
  return impl as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

function rpcOf(init: RequestInit): { method: string; id?: number; params?: Record<string, unknown> } {
  return JSON.parse(String(init.body));
}

const TOOLS_RESULT = {
  jsonrpc: "2.0",
  result: { tools: INSTAGRAM_READ_TOOL_ALLOWLIST.map((name) => ({ name })) },
};

function standardHandlers(toolResult: unknown) {
  return [
    (u: string, init: RequestInit) => jsonResponse({ jsonrpc: "2.0", id: rpcOf(init).id, result: { capabilities: {} } }),
    () => new Response(null, { status: 202 }), // notifications/initialized
    (u: string, init: RequestInit) => jsonResponse({ ...TOOLS_RESULT, id: rpcOf(init).id }),
    (u: string, init: RequestInit) =>
      jsonResponse({
        jsonrpc: "2.0",
        id: rpcOf(init).id,
        result: { content: [{ type: "text", text: JSON.stringify(toolResult) }] },
      }),
  ];
}

beforeEach(() => {
  vi.stubEnv("COMPOSIO_CONSUMER_API_KEY", "test-key-not-real");
  vi.stubEnv("COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID", "ca_test123");
  vi.stubEnv("COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE", "grafikcem");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("composio config (server-only)", () => {
  it("üç parça da varsa configured; NEXT_PUBLIC_* değişkeni yok", () => {
    const cfg = getComposioConfig();
    expect(cfg.configured).toBe(true);
    expect(Object.keys(process.env).some((k) => k.startsWith("NEXT_PUBLIC_COMPOSIO"))).toBe(false);
  });

  it("eksik parçalar env ADI olarak raporlanır (değer asla)", () => {
    vi.stubEnv("COMPOSIO_CONSUMER_API_KEY", "");
    expect(missingComposioEnvNames()).toContain("COMPOSIO_CONSUMER_API_KEY");
  });

  it("provider modu yalnız auto|composio|meta; bozuk değer auto'ya düşer", () => {
    vi.stubEnv("INSTAGRAM_DATA_PROVIDER", "hacky");
    expect(getComposioConfig().provider).toBe("auto");
    vi.stubEnv("INSTAGRAM_DATA_PROVIDER", "composio");
    expect(getComposioConfig().provider).toBe("composio");
  });
});

describe("read-tool allowlist (ADR-032)", () => {
  it("allowlist'teki read tool'lara izin verir", () => {
    for (const slug of INSTAGRAM_READ_TOOL_ALLOWLIST) {
      expect(evaluateToolPolicy(slug).allowed).toBe(true);
    }
  });

  it("write fiilli slug'lar deny edilir (allowlist'e yazılsalar bile)", () => {
    for (const slug of [
      "INSTAGRAM_CREATE_MEDIA",
      "INSTAGRAM_POST_COMMENT",
      "INSTAGRAM_MEDIA_PUBLISH",
      "INSTAGRAM_SEND_MESSAGE",
      "INSTAGRAM_DELETE_COMMENT",
      "INSTAGRAM_REPLY_TO_COMMENT",
      "INSTAGRAM_UPDATE_CAPTION",
      "INSTAGRAM_MARK_SEEN",
    ]) {
      expect(evaluateToolPolicy(slug)).toMatchObject({ allowed: false, reason: "denied_verb" });
    }
  });

  it("DM/messaging read tool'ları da bilinçli DENY (direktif: DM yasak)", () => {
    expect(evaluateToolPolicy("INSTAGRAM_LIST_ALL_CONVERSATIONS").allowed).toBe(false);
    expect(evaluateToolPolicy("INSTAGRAM_LIST_ALL_MESSAGES").allowed).toBe(false);
    expect(evaluateToolPolicy("INSTAGRAM_GET_CONVERSATION").allowed).toBe(false);
  });

  it("bilinmeyen tool deny", () => {
    expect(evaluateToolPolicy("INSTAGRAM_GET_SOMETHING_NEW")).toMatchObject({
      allowed: false,
      reason: "not_in_allowlist",
    });
  });
});

describe("ComposioMcpClient", () => {
  it("MCP endpoint sabittir ve auth header'ı yalnız server env'den gelir", async () => {
    const fetchImpl = makeFetchScript(standardHandlers({ id: "1789", username: "grafikcem" }));
    const client = new ComposioMcpClient({ fetchImpl });
    await client.callTool("INSTAGRAM_GET_USER_INFO", { connected_account_id: "ca_test123" });
    const calls = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls.every(([url]) => String(url) === ENDPOINT)).toBe(true);
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers["x-consumer-api-key"]).toBe("test-key-not-real");
  });

  it("key yoksa not_configured (canlı istek atılmaz)", async () => {
    vi.stubEnv("COMPOSIO_CONSUMER_API_KEY", "");
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = new ComposioMcpClient({ fetchImpl });
    await expect(client.listTools()).rejects.toMatchObject({ errorClass: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("policy deny fetch'e hiç ULAŞMAZ (write tool çağrısı imkânsız)", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = new ComposioMcpClient({ fetchImpl });
    await expect(client.callTool("INSTAGRAM_MEDIA_PUBLISH", {})).rejects.toMatchObject({
      errorClass: "policy_denied",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("discovery fail-closed: allowlist'te olup canlı tools/list'te olmayan slug tool_not_found", async () => {
    const partialTools = {
      jsonrpc: "2.0",
      result: { tools: [{ name: "INSTAGRAM_GET_USER_INFO" }] },
    };
    const fetchImpl = makeFetchScript([
      (u, init) => jsonResponse({ jsonrpc: "2.0", id: rpcOf(init).id, result: {} }),
      () => new Response(null, { status: 202 }),
      (u, init) => jsonResponse({ ...partialTools, id: rpcOf(init).id }),
    ]);
    const client = new ComposioMcpClient({ fetchImpl });
    await expect(
      client.callTool("INSTAGRAM_GET_IG_MEDIA_INSIGHTS", { media_id: "m1" })
    ).rejects.toMatchObject({ errorClass: "tool_not_found" });
  });

  it("429 sınırlı retry + backoff sonrası başarır", async () => {
    vi.useFakeTimers();
    try {
      const handlers = [
        (u: string, init: RequestInit) => jsonResponse({ jsonrpc: "2.0", id: rpcOf(init).id, result: {} }),
        () => new Response(null, { status: 202 }),
        () => new Response("rate", { status: 429 }),
        (u: string, init: RequestInit) => jsonResponse({ ...TOOLS_RESULT, id: rpcOf(init).id }),
      ];
      const fetchImpl = makeFetchScript(handlers);
      const client = new ComposioMcpClient({ fetchImpl });
      const p = client.listTools();
      await vi.runAllTimersAsync();
      const tools = await p;
      expect(tools.length).toBe(INSTAGRAM_READ_TOOL_ALLOWLIST.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("401 unauthorized retry EDİLMEZ", async () => {
    const fetchImpl = makeFetchScript([() => new Response("no", { status: 401 })]);
    const client = new ComposioMcpClient({ fetchImpl });
    await expect(client.listTools()).rejects.toMatchObject({ errorClass: "unauthorized" });
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });

  it("yanıt boyutu tavanı: response_too_large", async () => {
    const huge = "x".repeat(2_100_000);
    const fetchImpl = makeFetchScript([
      (u, init) => jsonResponse({ jsonrpc: "2.0", id: rpcOf(init).id, result: {} }),
      () => new Response(null, { status: 202 }),
      () => new Response(huge, { status: 200, headers: { "content-type": "application/json" } }),
    ]);
    const client = new ComposioMcpClient({ fetchImpl });
    await expect(client.listTools()).rejects.toMatchObject({ errorClass: "response_too_large" });
  });

  it("SSE yanıtı parse edilir", () => {
    const body = `event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"tools":[]}}\n\n`;
    const parsed = parseSseForResponse(body, 3);
    expect(parsed?.result).toEqual({ tools: [] });
    expect(parseSseForResponse(body, 99)).toBeNull();
  });

  it("hata metinlerinde secret redakte edilir", () => {
    expect(redactSecrets('x-consumer-api-key: "ak_livesecret12345678"')).not.toContain("livesecret");
    expect(redactSecrets("bearer token=sk_abcdefgh12345678")).not.toContain("abcdefgh");
    const err = new ComposioBridgeError("network", "api_key=super-secret-value hata");
    expect(err.message).not.toContain("super-secret-value");
  });

  it("tool isError sonucu tool_error sınıfına çevrilir", async () => {
    const fetchImpl = makeFetchScript([
      (u, init) => jsonResponse({ jsonrpc: "2.0", id: rpcOf(init).id, result: {} }),
      () => new Response(null, { status: 202 }),
      (u, init) => jsonResponse({ ...TOOLS_RESULT, id: rpcOf(init).id }),
      (u, init) =>
        jsonResponse({
          jsonrpc: "2.0",
          id: rpcOf(init).id,
          result: { isError: true, content: [{ type: "text", text: "IG hesabı Business değil" }] },
        }),
    ]);
    const client = new ComposioMcpClient({ fetchImpl });
    await expect(client.callTool("INSTAGRAM_GET_USER_INFO", {})).rejects.toMatchObject({
      errorClass: "tool_error",
    });
  });
});
