import { redactError } from "@/lib/utils/redactSecrets";

export type OpenRouterKeyStatus = {
  limitUsd: number | null;
  limitRemainingUsd: number | null;
  limitReset: string | null;
  usageMonthlyUsd: number;
  checkedAt: string;
};

type KeyApiPayload = {
  data?: {
    limit?: unknown;
    limit_remaining?: unknown;
    limit_reset?: unknown;
    usage_monthly?: unknown;
  };
};

let cached: { expiresAt: number; value: OpenRouterKeyStatus | null } | null = null;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cacheTtlMs(): number {
  const raw = Number(process.env.OPENROUTER_KEY_STATUS_CACHE_MS ?? 300_000);
  return Number.isFinite(raw) ? Math.max(30_000, raw) : 300_000;
}

/**
 * Read-only, free OpenRouter key status. The API key and key label are never
 * returned or logged. A short cache keeps this check off the hot path while
 * still detecting dashboard-side monthly cap changes.
 */
export async function getOpenRouterKeyStatus(
  opts: { force?: boolean; nowMs?: number } = {},
): Promise<OpenRouterKeyStatus | null> {
  const nowMs = opts.nowMs ?? Date.now();
  if (!opts.force && cached && cached.expiresAt > nowMs) return cached.value;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    cached = { expiresAt: nowMs + cacheTtlMs(), value: null };
    return null;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`key_status_${response.status}`);

    const payload = (await response.json()) as KeyApiPayload;
    const data = payload.data ?? {};
    const value: OpenRouterKeyStatus = {
      limitUsd: finiteNumber(data.limit),
      limitRemainingUsd: finiteNumber(data.limit_remaining),
      limitReset: typeof data.limit_reset === "string" ? data.limit_reset : null,
      usageMonthlyUsd: Math.max(0, finiteNumber(data.usage_monthly) ?? 0),
      checkedAt: new Date(nowMs).toISOString(),
    };
    cached = { expiresAt: nowMs + cacheTtlMs(), value };
    return value;
  } catch (err) {
    // The provider enforces its own key cap. If this read-only endpoint is
    // unavailable, keep the local DB-backed gate operational — but SURFACE the
    // degradation: the redundant provider-side cap check is off for the cache TTL,
    // so an operator has no other signal it happened. Local enforcement stays intact.
    console.warn(
      "[openrouter-key-status] probe failed — degrading to local-only budget enforcement:",
      redactError(err),
    );
    cached = { expiresAt: nowMs + 30_000, value: null };
    return null;
  }
}

export function clearOpenRouterKeyStatusCache(): void {
  cached = null;
}

/** Keep a cached provider snapshot current between free /key refreshes. */
export function noteOpenRouterSpend(costUsd: number): void {
  if (!cached?.value || !Number.isFinite(costUsd) || costUsd <= 0) return;
  const configuredMultiplier = Number(process.env.OPENROUTER_USAGE_SAFETY_MULTIPLIER ?? 1.2);
  const safetyMultiplier =
    Number.isFinite(configuredMultiplier) && configuredMultiplier >= 1
      ? configuredMultiplier
      : 1.2;
  const guardedCostUsd = costUsd * safetyMultiplier;
  cached = {
    ...cached,
    value: {
      ...cached.value,
      usageMonthlyUsd: cached.value.usageMonthlyUsd + guardedCostUsd,
      limitRemainingUsd:
        cached.value.limitRemainingUsd == null
          ? null
          : Math.max(0, cached.value.limitRemainingUsd - guardedCostUsd),
    },
  };
}
