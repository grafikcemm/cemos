import { estimateCost, resolveModel, type ModelRole } from "@/lib/ai/model-config";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GenerateJsonOptions = {
  role: ModelRole;
  system: string;
  user: string;
  temperature?: number;
  /** Hard ceiling for completion tokens. Defaults per-role; without it providers
   *  apply a low default cap that silently truncates large JSON (the multi-draft
   *  writer), yielding short/half drafts. */
  maxTokens?: number;
  /** Absolute wall-clock deadline (epoch ms). Per-call abort timeout becomes
   *  clamp(5s, deadline-now, 60s) so a cron time budget bounds each LLM call. */
  deadlineMs?: number;
};

/** Per-role completion-token ceilings. Writer needs the most (multi-angle JSON
 *  incl. a long thread); judge/editor far less. */
const DEFAULT_MAX_TOKENS_BY_ROLE: Partial<Record<ModelRole, number>> = {
  creativeWriter: 5000,
  viralJudge: 2500,
  finalEditor: 1500,
};

function resolveMaxTokens(role: ModelRole, override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  return DEFAULT_MAX_TOKENS_BY_ROLE[role] ?? 2000;
}

/** Map a raw provider error to a non-sensitive category so it can be stored /
 *  surfaced without leaking provider account, credit, or key diagnostics (DH-014). */
export function classifyOpenRouterError(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  if (/402|credit|insufficient|payment|quota/.test(m)) return "provider_credit";
  if (/429|rate.?limit|too many/.test(m)) return "rate_limit";
  if (/abort|timeout|timed out|etimedout/.test(m)) return "timeout";
  if (/json|parse|parseable/.test(m)) return "invalid_json";
  if (/\b5\d\d\b|server error|internal/.test(m)) return "server_error";
  return "unknown";
}

export type GenerateJsonResult<T> = {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  /**
   * The REAL request cost reported by OpenRouter (USD) when the response carries
   * `usage.cost`. Falls back to `estimatedCostUsd` when the provider omits it.
   * Additive field — existing callers that read `estimatedCostUsd` are untouched.
   */
  actualCostUsd: number;
  modelFallbackUsed?: boolean;
  modelFallbackReason?: string;
};

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  throw new Error("Model did not return parseable JSON.");
}

function getFallbackModels(baseModel: string): string[] {
  // Fallback'ler kaliteyi koruyacak sekilde sadece solid mid/frontier modeller icerir.
  // Zayif free-tier (gemma-2-9b:free, llama-3-8b:free) cikarildi: sessiz kalite dususune yol aciyordu.
  const list = [baseModel];
  if (baseModel.includes("claude-sonnet-4-5") || baseModel.includes("claude-sonnet-4.5")) {
    list.push("google/gemini-2.5-pro", "google/gemini-2.5-flash");
  } else if (baseModel.includes("gemini-2.5-pro")) {
    list.push("anthropic/claude-sonnet-4-5", "google/gemini-2.5-flash");
  } else if (baseModel.includes("gemini-2.5-flash")) {
    list.push("google/gemini-2.5-pro", "deepseek/deepseek-chat");
  } else if (baseModel.includes("gpt-4o-mini")) {
    list.push("google/gemini-2.5-flash", "deepseek/deepseek-chat");
  } else if (baseModel.includes("gpt-4o")) {
    list.push("google/gemini-2.5-pro", "google/gemini-2.5-flash");
  } else if (baseModel.includes("deepseek-chat")) {
    list.push("google/gemini-2.5-flash", "google/gemini-2.5-pro");
  } else {
    list.push("google/gemini-2.5-flash", "google/gemini-2.5-pro");
  }
  return Array.from(new Set(list));
}

export async function generateJson<T>({
  role,
  system,
  user,
  temperature = 0.7,
  maxTokens,
  deadlineMs,
}: GenerateJsonOptions): Promise<GenerateJsonResult<T>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }
  const maxCompletionTokens = resolveMaxTokens(role, maxTokens);
  // Skip a call whose deadline is already spent — no doomed network request.
  if (typeof deadlineMs === "number" && deadlineMs - Date.now() <= 0) {
    throw new Error("LLM call skipped: deadline exceeded");
  }

  const baseModel = resolveModel(role);
  const modelsToTry = getFallbackModels(baseModel);

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    const requestBody = {
      model,
      messages,
      temperature,
      max_tokens: maxCompletionTokens,
      response_format: { type: "json_object" },
      // Ask OpenRouter to include the real request cost in the response payload.
      usage: { include: true },
    };

    const maxRetries = 1;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const LLM_CALL_TIMEOUT_MS = 60_000;
        // When a cron deadline is supplied, bound each call to the remaining wall
        // clock (min 5s) so generation can't overrun the invocation budget.
        const timeoutMs =
          typeof deadlineMs === "number"
            ? Math.max(5_000, Math.min(LLM_CALL_TIMEOUT_MS, deadlineMs - Date.now()))
            : LLM_CALL_TIMEOUT_MS;
        const makeAbortSignal = () => {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), timeoutMs);
          return ctrl.signal;
        };

        let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
            "X-Title": process.env.OPENROUTER_APP_NAME || "CemOS",
          },
          body: JSON.stringify(requestBody),
          signal: makeAbortSignal(),
        });

        if (response.status === 400 || response.status === 422) {
          response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
              "X-Title": process.env.OPENROUTER_APP_NAME || "CemOS",
            },
            body: JSON.stringify({
              model,
              messages,
              temperature,
              max_tokens: maxCompletionTokens,
              usage: { include: true },
            }),
            signal: makeAbortSignal(),
          });
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
        }

        const payload = await response.json();
        const content = payload.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new Error("OpenRouter response did not include text content.");
        }

        const inputTokens = payload.usage?.prompt_tokens ?? Math.ceil((system.length + user.length) / 4);
        const outputTokens = payload.usage?.completion_tokens ?? Math.ceil(content.length / 4);

        const estimatedCostUsd = estimateCost(inputTokens, outputTokens, role);
        // OpenRouter returns the real spend in `usage.cost` (USD) when requested.
        // Fall back to the token estimate when it is absent or unparseable.
        const rawCost = payload.usage?.cost;
        const actualCostUsd =
          typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost >= 0
            ? rawCost
            : estimatedCostUsd;

        const modelFallbackUsed = model !== baseModel;
        // Store only a non-sensitive category (DH-014); the raw provider body is
        // logged to stderr in the catch below, never persisted/returned.
        const modelFallbackReason = modelFallbackUsed
          ? `${baseModel}→${model}:${classifyOpenRouterError(lastError?.message)}`
          : undefined;

        return {
          data: JSON.parse(extractJson(content)) as T,
          model,
          inputTokens,
          outputTokens,
          estimatedCostUsd,
          actualCostUsd,
          modelFallbackUsed,
          modelFallbackReason,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[OpenRouter] generateJson attempt ${attempt + 1} with model ${model} failed: ${lastError.message}`);
      }
    }
  }

  throw lastError || new Error("Failed to generate JSON after trying all model fallbacks.");
}
