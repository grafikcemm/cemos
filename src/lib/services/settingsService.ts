import { prisma } from "@/lib/db/client";

/**
 * Durable, server-authoritative operator settings (Phase 5F §6).
 *
 * The model profile governs the legacy role-based routing path
 * (`resolveModel`). It is stored in the `OperatorSetting` table so the choice
 * is durable across serverless instances and cold starts — unlike the old
 * `.env.local` write, which was a no-op on Vercel's read-only FS and reported a
 * false success.
 *
 * Runtime resolver hydration: `resolveModel` reads `process.env.MODEL_PROFILE`
 * synchronously (it is called on hot, non-async paths). This service is the
 * single async authority; `get`/`set` converge `process.env.MODEL_PROFILE` on
 * the durable value, so the sync resolver honors the persisted choice once a
 * node-runtime path touches the settings surface in that instance (the
 * `/api/settings` GET reads it on load; `setModelProfile` on change). It is
 * deliberately NOT hydrated from `instrumentation.register()` — pulling Prisma
 * into instrumentation forces the client into the edge webpack bundle, which
 * cannot resolve `node:child_process`. Presets pin their own models and are
 * unaffected by the profile either way.
 */

export type ModelProfile = "dev" | "operator_quality" | "premium";

const VALID_PROFILES: ReadonlySet<string> = new Set([
  "dev",
  "operator_quality",
  "premium",
]);
const MODEL_PROFILE_KEY = "model_profile";
const DEFAULT_PROFILE: ModelProfile = "operator_quality";
const CACHE_TTL_MS = 30_000;

let cache: { value: ModelProfile; expiresAt: number } | null = null;

export function isModelProfile(raw: unknown): raw is ModelProfile {
  return typeof raw === "string" && VALID_PROFILES.has(raw);
}

function coerce(raw: string | null | undefined): ModelProfile | null {
  return isModelProfile(raw) ? raw : null;
}

/** Env → default fallback used when the durable store is unavailable. */
function envProfile(): ModelProfile {
  return coerce(process.env.MODEL_PROFILE) ?? DEFAULT_PROFILE;
}

/**
 * The durable model profile. Reads `OperatorSetting`, caches for a short TTL,
 * and converges `process.env.MODEL_PROFILE` so the synchronous `resolveModel`
 * path honors the persisted choice. Fail-open: if the table is not pushed yet
 * (P2021) or the DB is transiently unavailable, returns the env/default value
 * WITHOUT caching the miss, so full behavior resumes once the DB is reachable.
 */
export async function getModelProfile(now: number = Date.now()): Promise<ModelProfile> {
  if (cache && cache.expiresAt > now) return cache.value;
  try {
    const row = await prisma.operatorSetting.findUnique({
      where: { key: MODEL_PROFILE_KEY },
    });
    const value = coerce(row?.value) ?? envProfile();
    process.env.MODEL_PROFILE = value;
    cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    return envProfile();
  }
}

/**
 * Persist the model profile durably. Throws on write failure so the POST route
 * only reports success once the value is committed (no serverless success lie).
 */
export async function setModelProfile(
  profile: ModelProfile,
  now: number = Date.now(),
): Promise<ModelProfile> {
  if (!isModelProfile(profile)) {
    throw new Error(`Geçersiz model profili: ${String(profile)}`);
  }
  await prisma.operatorSetting.upsert({
    where: { key: MODEL_PROFILE_KEY },
    create: { key: MODEL_PROFILE_KEY, value: profile },
    update: { value: profile },
  });
  process.env.MODEL_PROFILE = profile;
  cache = { value: profile, expiresAt: now + CACHE_TTL_MS };
  return profile;
}

/** Test seam — clear the in-process cache. */
export function __resetSettingsCache(): void {
  cache = null;
}
