import { z } from "zod";
import {
  COMPOSIO_MCP_ENDPOINT,
  COMPOSIO_AUTH_HEADER,
  readComposioApiKey,
} from "@/lib/composio/config";
import { evaluateToolPolicy } from "@/lib/composio/allowlist";
import { redactError } from "@/lib/utils/redactSecrets";

/**
 * CemOS runtime MCP köprüsü (ADR-032) — Claude Code'dan TAMAMEN bağımsız,
 * server-only, deterministik (LLM'siz) Composio istemcisi.
 *
 * Transport: resmî MCP Streamable HTTP (JSON-RPC 2.0 POST; yanıt JSON veya
 * SSE olabilir — ikisi de parse edilir). Endpoint SABİT: connect.composio.dev/mcp
 * (Composio REST SDK'sına sessiz geçiş YOK).
 *
 * Güvenlik sözleşmesi:
 *  - `x-consumer-api-key` yalnız server env'den; header/istek gövdesi asla
 *    loglanmaz/raporlanmaz; hata metinleri redakte edilir.
 *  - Tool çağrısı İKİ katmandan geçer: explicit allowlist + deny-verb kalıbı
 *    (allowlist.ts) VE runtime discovery doğrulaması (tools/list'te yoksa
 *    fail-closed `tool_not_found`).
 *  - timeout + sınırlı retry (yalnız ağ/5xx/429, exponential backoff) +
 *    yanıt boyutu tavanı.
 */

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 750;
const MAX_RESPONSE_BYTES = 2_000_000; // 2MB tavan — dev medya listeleri bile çok altında

export type ComposioErrorClass =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "network"
  | "protocol"
  | "response_too_large"
  | "policy_denied"
  | "tool_not_found"
  | "tool_error";

export class ComposioBridgeError extends Error {
  readonly errorClass: ComposioErrorClass;
  constructor(errorClass: ComposioErrorClass, message: string) {
    super(redactSecrets(message));
    this.name = "ComposioBridgeError";
    this.errorClass = errorClass;
  }
}

/** Key/token benzeri değerleri hata metinlerinden temizler. */
export function redactSecrets(s: string): string {
  return s
    .replace(/(x-consumer-api-key|authorization|api[_-]?key|token)["':\s=]+[^\s"',}]+/gi, "$1=[redacted]")
    .replace(/\b(ak_|sk_|ck_)[A-Za-z0-9_-]{8,}\b/g, "[redacted]");
}

function errMsg(e: unknown): string {
  return redactError(e);
}

// ── JSON-RPC / SSE taşıma ─────────────────────────────────────────────────────

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
};

/** SSE gövdesinden hedef id'li JSON-RPC yanıtını çıkarır. */
export function parseSseForResponse(body: string, id: number): JsonRpcResponse | null {
  for (const rawEvent of body.split(/\n\n/)) {
    const dataLines = rawEvent
      .split(/\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    if (dataLines.length === 0) continue;
    try {
      const parsed = JSON.parse(dataLines.join("")) as JsonRpcResponse;
      if (parsed && parsed.id === id) return parsed;
    } catch {
      // partial/keepalive event — atla
    }
  }
  return null;
}

type SessionState = { sessionId: string | null; initialized: boolean };

/**
 * Tek kullanımlık istemci oturumu. Serverless-dostu: her sync koşusu kendi
 * kısa ömürlü oturumunu açar; kalıcı global state yok.
 */
export class ComposioMcpClient {
  private session: SessionState = { sessionId: null, initialized: false };
  private nextId = 1;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts?: { endpoint?: string; fetchImpl?: typeof fetch }) {
    this.endpoint = opts?.endpoint ?? COMPOSIO_MCP_ENDPOINT;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  private async rpc(method: string, params: unknown, opts?: { notification?: boolean }): Promise<unknown> {
    const apiKey = readComposioApiKey();
    if (!apiKey) throw new ComposioBridgeError("not_configured", "COMPOSIO_CONSUMER_API_KEY tanımlı değil.");

    const id = opts?.notification ? undefined : this.nextId++;
    const payload: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (params !== undefined) payload.params = params;
    if (id !== undefined) payload.id = id;

    let lastError: ComposioBridgeError | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * 2 ** (attempt - 1)));
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          [COMPOSIO_AUTH_HEADER]: apiKey,
        };
        if (this.session.sessionId) headers["mcp-session-id"] = this.session.sessionId;

        const res = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });

        const newSession = res.headers.get("mcp-session-id");
        if (newSession) this.session.sessionId = newSession;

        if (res.status === 401 || res.status === 403) {
          throw new ComposioBridgeError("unauthorized", `Composio auth reddetti (HTTP ${res.status}).`);
        }
        if (res.status === 429) {
          lastError = new ComposioBridgeError("rate_limited", "Composio rate limit (HTTP 429).");
          continue; // backoff + retry
        }
        if (res.status >= 500) {
          lastError = new ComposioBridgeError("network", `Composio sunucu hatası (HTTP ${res.status}).`);
          continue;
        }
        if (!res.ok && res.status !== 202) {
          const text = await res.text().catch(() => "");
          throw new ComposioBridgeError("protocol", `HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        if (opts?.notification || res.status === 202) return null;

        const lenHeader = Number(res.headers.get("content-length") ?? "0");
        if (lenHeader > MAX_RESPONSE_BYTES) {
          throw new ComposioBridgeError("response_too_large", `Yanıt ${lenHeader} bayt — tavan aşıldı.`);
        }
        const text = await res.text();
        if (text.length > MAX_RESPONSE_BYTES) {
          throw new ComposioBridgeError("response_too_large", `Yanıt ${text.length} bayt — tavan aşıldı.`);
        }

        const contentType = res.headers.get("content-type") ?? "";
        let parsed: JsonRpcResponse | null = null;
        if (contentType.includes("text/event-stream")) {
          parsed = parseSseForResponse(text, id as number);
        } else {
          try {
            parsed = JSON.parse(text) as JsonRpcResponse;
          } catch {
            throw new ComposioBridgeError("protocol", "Composio yanıtı JSON parse edilemedi.");
          }
        }
        if (!parsed) throw new ComposioBridgeError("protocol", "JSON-RPC yanıtı bulunamadı.");
        if (parsed.error) {
          throw new ComposioBridgeError(
            "tool_error",
            `JSON-RPC hata ${parsed.error.code ?? "?"}: ${parsed.error.message ?? "bilinmeyen"}`
          );
        }
        return parsed.result;
      } catch (e) {
        if (e instanceof ComposioBridgeError) {
          if (e.errorClass === "rate_limited" || e.errorClass === "network") {
            lastError = e;
            continue;
          }
          throw e;
        }
        const msg = errMsg(e);
        if (/abort/i.test(msg)) {
          lastError = new ComposioBridgeError("timeout", `Composio isteği ${REQUEST_TIMEOUT_MS}ms'de zaman aşımı.`);
        } else {
          lastError = new ComposioBridgeError("network", `Ağ hatası: ${msg}`);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new ComposioBridgeError("network", "Composio isteği başarısız.");
  }

  private async ensureInitialized(): Promise<void> {
    if (this.session.initialized) return;
    await this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "cemos-instagram-bridge", version: "1.0.0" },
    });
    await this.rpc("notifications/initialized", {}, { notification: true });
    this.session.initialized = true;
  }

  /** tools/list — discovery. Yalnız slug + kısa açıklama döner (şema loglanmaz). */
  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    await this.ensureInitialized();
    const result = (await this.rpc("tools/list", {})) as { tools?: Array<{ name: string; description?: string }> };
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return tools.map((t) => ({ name: t.name, description: t.description }));
  }

  /**
   * Allowlist + deny + discovery kapılı tool çağrısı. `arguments` içine
   * connected account id açıkça konur (sessiz hesap seçimi yok).
   */
  async callTool(slug: string, args: Record<string, unknown>): Promise<unknown> {
    const policy = evaluateToolPolicy(slug);
    if (!policy.allowed) {
      throw new ComposioBridgeError(
        "policy_denied",
        `Tool '${slug}' reddedildi (${policy.reason}) — yalnız read-only Instagram allowlist'i çağrılabilir.`
      );
    }
    await this.ensureInitialized();
    const available = await this.listTools();
    if (!available.some((t) => t.name === slug)) {
      throw new ComposioBridgeError(
        "tool_not_found",
        `Tool '${slug}' canlı MCP tool listesinde yok — toolkit sözleşmesi değişmiş olabilir; fail-closed.`
      );
    }
    const result = (await this.rpc("tools/call", { name: slug, arguments: args })) as {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: unknown;
    };
    if (result?.isError) {
      const text = (result.content ?? [])
        .map((c) => c.text ?? "")
        .join(" ")
        .slice(0, 300);
      throw new ComposioBridgeError("tool_error", `Tool '${slug}' hata döndü: ${text}`);
    }
    if (result?.structuredContent !== undefined) return result.structuredContent;
    // İçerik text ise JSON olmayı dene; değilse ham metin döner.
    const text = (result?.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

// ── Loglanabilir çağrı özeti (secret'sız) ────────────────────────────────────

export const ComposioCallLogSchema = z.object({
  toolSlug: z.string(),
  provider: z.literal("composio"),
  status: z.enum(["ok", "error"]),
  latencyMs: z.number(),
  itemCount: z.number().optional(),
  errorClass: z.string().optional(),
});
export type ComposioCallLog = z.infer<typeof ComposioCallLogSchema>;

/** Ölçümlü çağrı — döndürülen log satırı secret/payload içermez. */
export async function callToolLogged(
  client: ComposioMcpClient,
  slug: string,
  args: Record<string, unknown>
): Promise<{ data: unknown; log: ComposioCallLog }> {
  const t0 = Date.now();
  try {
    const data = await client.callTool(slug, args);
    const itemCount = Array.isArray((data as { data?: unknown[] })?.data)
      ? ((data as { data: unknown[] }).data.length)
      : Array.isArray(data)
        ? (data as unknown[]).length
        : undefined;
    return {
      data,
      log: { toolSlug: slug, provider: "composio", status: "ok", latencyMs: Date.now() - t0, itemCount },
    };
  } catch (e) {
    const errorClass = e instanceof ComposioBridgeError ? e.errorClass : "network";
    return Promise.reject(
      Object.assign(e instanceof Error ? e : new Error(String(e)), {
        callLog: {
          toolSlug: slug,
          provider: "composio",
          status: "error",
          latencyMs: Date.now() - t0,
          errorClass,
        } satisfies ComposioCallLog,
      })
    );
  }
}
