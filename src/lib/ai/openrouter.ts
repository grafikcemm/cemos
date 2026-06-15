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
};

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
}: GenerateJsonOptions): Promise<GenerateJsonResult<T>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing.");
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
      response_format: { type: "json_object" },
      // Ask OpenRouter to include the real request cost in the response payload.
      usage: { include: true },
    };

    const maxRetries = 1;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const LLM_CALL_TIMEOUT_MS = 60_000;
        const makeAbortSignal = () => {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), LLM_CALL_TIMEOUT_MS);
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
        const modelFallbackReason = modelFallbackUsed
          ? `${baseModel} failed: ${lastError?.message || "Unknown error"}`
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
