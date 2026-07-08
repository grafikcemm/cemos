import { estimateCost, resolveModel, type ModelRole } from "@/lib/ai/model-config";

type TextContentPart = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | TextContentPart[];
};

export type StructuredMode = "json_schema" | "json_object" | "none";

export type JsonSchemaSpec = {
  name: string;
  schema: Record<string, unknown>;
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
  /** Preset katmanı: rol-registry yerine bu slug primary olur. */
  model?: string;
  /** Preset katmanı: verilirse getFallbackModels yerine bu zincir denenir. */
  fallbacks?: string[];
  /** Yapısal çıktı modu. Degrade zinciri: json_schema → json_object → none
   *  (400/422'de bir seviye düşülür — mevcut strip-retry davranışının genellemesi). */
  structured?: StructuredMode;
  /** structured === "json_schema" iken zorunlu şema (strict:true gönderilir). */
  jsonSchema?: JsonSchemaSpec;
  /** Anthropic modellerinde system bloğuna cache_control breakpoint ekler. */
  cacheControl?: boolean;
  /** provider.order — örn. ["anthropic"]. */
  providerOrder?: string[];
  sort?: "price";
  dataCollection?: "allow" | "deny";
  /** OpenRouter reasoning.effort. Degrade retry'da response_format ile birlikte düşer. */
  reasoning?: "low" | "medium" | "high";
  /** Tek çağrı timeout tavanı (default 60s). Preset timeoutMs buradan geçer. */
  timeoutMs?: number;
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
  // ── Pinned 2026-07 katalog zincirleri (FINAL-OPENROUTER-ROUTING §1-2) ──
  if (baseModel.includes("claude-sonnet-5")) {
    list.push("openai/gpt-5.5-20260423", "google/gemini-pro-latest");
  } else if (baseModel.includes("gpt-5.5")) {
    list.push("google/gemini-3.5-flash-20260519", "anthropic/claude-sonnet-5-20260630");
  } else if (baseModel.includes("gemini-3.5-flash")) {
    list.push("deepseek/deepseek-v4-pro-20260423", "openai/gpt-5.5-20260423");
  } else if (baseModel.includes("gemini-3.1-flash-lite")) {
    list.push("deepseek/deepseek-v4-flash-20260423", "google/gemini-3.5-flash-20260519");
  } else if (baseModel.includes("deepseek-v4-flash")) {
    list.push("google/gemini-3.1-flash-lite-20260507", "google/gemini-3.5-flash-20260519");
  } else if (baseModel.includes("deepseek-v4-pro")) {
    list.push("google/gemini-3.5-flash-20260519");
  } else if (baseModel.includes("gpt-mini-latest")) {
    list.push("google/gemini-3.1-flash-lite-20260507", "deepseek/deepseek-v4-flash-20260423");
    // ── Legacy env-override zincirleri (eski slug pinleyen kurulumlar için) ──
  } else if (baseModel.includes("claude-sonnet-4-5") || baseModel.includes("claude-sonnet-4.5")) {
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
    list.push("google/gemini-3.5-flash-20260519", "openai/gpt-5.5-20260423");
  }
  return Array.from(new Set(list));
}

/** Degrade sırası: istenen moddan aşağı doğru. 400/422'de bir seviye düşülür. */
function structuredLevels(mode: StructuredMode, hasSchema: boolean): StructuredMode[] {
  if (mode === "json_schema" && hasSchema) return ["json_schema", "json_object", "none"];
  if (mode === "none") return ["none"];
  return ["json_object", "none"];
}

function buildResponseFormat(
  level: StructuredMode,
  jsonSchema?: JsonSchemaSpec,
): Record<string, unknown> | undefined {
  if (level === "json_schema" && jsonSchema) {
    return {
      type: "json_schema",
      json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema },
    };
  }
  if (level === "json_object") return { type: "json_object" };
  return undefined;
}

export async function generateJson<T>({
  role,
  system,
  user,
  temperature = 0.7,
  maxTokens,
  deadlineMs,
  model: modelOverride,
  fallbacks,
  structured = "json_object",
  jsonSchema,
  cacheControl,
  providerOrder,
  sort,
  dataCollection,
  reasoning,
  timeoutMs: timeoutOverride,
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

  const baseModel = modelOverride ?? resolveModel(role);
  const modelsToTry = fallbacks
    ? Array.from(new Set([baseModel, ...fallbacks]))
    : getFallbackModels(baseModel);
  const levels = structuredLevels(structured, Boolean(jsonSchema));

  const provider =
    providerOrder || sort || dataCollection
      ? {
          ...(providerOrder ? { order: providerOrder, allow_fallbacks: true } : {}),
          ...(sort ? { sort } : {}),
          ...(dataCollection ? { data_collection: dataCollection } : {}),
        }
      : undefined;

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    // Anthropic cache_control breakpoint: statik system bloğu 0.1× read maliyetine
    // düşer. Yalnız anthropic slug'larında gönderilir (diğerleri content array'i
    // desteklese de gereksiz shape değişiminden kaçınıyoruz).
    const useCache = Boolean(cacheControl) && model.startsWith("anthropic/");
    const messages: ChatMessage[] = [
      useCache
        ? {
            role: "system",
            content: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          }
        : { role: "system", content: system },
      { role: "user", content: user },
    ];

    const buildBody = (level: StructuredMode, includeReasoning: boolean) => {
      const responseFormat = buildResponseFormat(level, jsonSchema);
      return {
        model,
        messages,
        temperature,
        max_tokens: maxCompletionTokens,
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(includeReasoning && reasoning ? { reasoning: { effort: reasoning } } : {}),
        ...(provider ? { provider } : {}),
        // Ask OpenRouter to include the real request cost in the response payload.
        usage: { include: true },
      };
    };

    const maxRetries = 1;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const LLM_CALL_TIMEOUT_MS =
          typeof timeoutOverride === "number" && timeoutOverride > 0 ? timeoutOverride : 60_000;
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
        const doFetch = (body: Record<string, unknown>) =>
          fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
              "X-Title": process.env.OPENROUTER_APP_NAME || "CemOS",
            },
            body: JSON.stringify(body),
            signal: makeAbortSignal(),
          });

        // Degrade zinciri: istenen structured seviyesinden başla; 400/422'de bir
        // seviye düş (json_schema → json_object → none). Son seviyede reasoning
        // parametresi de düşer (bazı sağlayıcılar shape'i reddediyor).
        let response = await doFetch(buildBody(levels[0], true));
        for (let li = 1; li < levels.length && (response.status === 400 || response.status === 422); li++) {
          response = await doFetch(buildBody(levels[li], li < levels.length - 1));
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
