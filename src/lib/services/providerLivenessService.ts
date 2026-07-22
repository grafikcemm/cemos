import { prisma } from "@/lib/db/client";

/**
 * Provider liveness from EXISTING persisted signals (Phase 5F §13 / BUG-05).
 *
 * A provider being "configured" (env present) is NOT the same as "working". This
 * service reads the durable audit trail — `UsageLog` (openrouter/socialdata/fal:
 * a failed call carries `meta.failed=true` + `meta.errorClass`) and
 * `LearnExportAttempt` (obsidian local/github channels) — to report the last
 * SUCCESS vs last FAILURE per provider. Never-called → `unknown` (NOT healthy).
 *
 * No new observability subsystem, no secrets/tokens/paths/response bodies — only
 * a timestamp, a non-sensitive error class, and a derived state.
 */

export type ProviderLivenessState = "verified" | "degraded" | "unknown";

export type ProviderLiveness = {
  state: ProviderLivenessState;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorClass: string | null;
};

const UNKNOWN: ProviderLiveness = {
  state: "unknown",
  lastSuccessAt: null,
  lastFailureAt: null,
  lastErrorClass: null,
};

const FAILED_MARKER = '"failed":true';

function deriveState(lastSuccessAt: Date | null, lastFailureAt: Date | null): ProviderLivenessState {
  if (lastFailureAt && (!lastSuccessAt || lastFailureAt > lastSuccessAt)) return "degraded";
  if (lastSuccessAt) return "verified";
  return "unknown";
}

function errorClassFromMeta(meta: string | null | undefined): string | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { errorClass?: unknown };
    return typeof parsed.errorClass === "string" ? parsed.errorClass : null;
  } catch {
    return null;
  }
}

/** UsageLog-backed provider (openrouter/socialdata/fal). */
async function usageLiveness(provider: string): Promise<ProviderLiveness> {
  const [success, failure] = await Promise.all([
    prisma.usageLog.findFirst({
      where: { provider, NOT: { meta: { contains: FAILED_MARKER } } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.usageLog.findFirst({
      where: { provider, meta: { contains: FAILED_MARKER } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, meta: true },
    }),
  ]);
  const lastSuccessAt = success?.createdAt ?? null;
  const lastFailureAt = failure?.createdAt ?? null;
  return {
    state: deriveState(lastSuccessAt, lastFailureAt),
    lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
    lastFailureAt: lastFailureAt ? lastFailureAt.toISOString() : null,
    lastErrorClass: errorClassFromMeta(failure?.meta),
  };
}

/** LearnExportAttempt-backed channel (obsidian local/github). */
async function exportLiveness(channel: string): Promise<ProviderLiveness> {
  const [success, failure] = await Promise.all([
    prisma.learnExportAttempt.findFirst({
      where: { channel, state: { in: ["succeeded", "already_current"] } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.learnExportAttempt.findFirst({
      where: { channel, state: { in: ["failed", "partial", "conflict"] } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, errorClass: true },
    }),
  ]);
  const lastSuccessAt = success?.startedAt ?? null;
  const lastFailureAt = failure?.startedAt ?? null;
  return {
    state: deriveState(lastSuccessAt, lastFailureAt),
    lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
    lastFailureAt: lastFailureAt ? lastFailureAt.toISOString() : null,
    lastErrorClass: failure?.errorClass ?? null,
  };
}

/**
 * Liveness for every provider we can derive from persisted data, keyed to the
 * integration-route provider keys. Fail-soft: any DB error → all `unknown`
 * (the panel still shows the env-configured status). Providers not returned here
 * (neon/meta/youtube/supadata/gemini/tier2/xapi) have no persisted usage ledger
 * of their own — the route defaults them to `unknown` rather than implying health.
 */
export async function getProviderLiveness(): Promise<Record<string, ProviderLiveness>> {
  try {
    const [openrouter, socialdata, fal, obsidianLocal, obsidianGithub] = await Promise.all([
      usageLiveness("openrouter"),
      usageLiveness("socialdata"),
      usageLiveness("fal"),
      exportLiveness("local_vault"),
      exportLiveness("github_vault"),
    ]);
    return {
      openrouter,
      socialdata,
      fal,
      obsidian_local: obsidianLocal,
      obsidian_github: obsidianGithub,
    };
  } catch {
    return {};
  }
}

export { UNKNOWN as UNKNOWN_LIVENESS };
