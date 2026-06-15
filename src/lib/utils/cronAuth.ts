import type { NextRequest } from "next/server";

/** True when running on Vercel or with NODE_ENV=production. */
export function isProductionRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

/** Whether CRON_SECRET is configured. Drives the Settings health signal. */
export function isCronSecretConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET);
}

/**
 * Shared auth check for Vercel cron routes. Vercel automatically sends
 * `Authorization: Bearer ${CRON_SECRET}` when the env var is configured.
 *
 * Fail-closed in production: if no secret is set on Vercel/prod the endpoint
 * rejects (401) instead of staying open. Local/dev without a secret stays open
 * for convenience.
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !isProductionRuntime();
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
