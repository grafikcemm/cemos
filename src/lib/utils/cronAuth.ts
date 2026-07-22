import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/** True when running on Vercel or with NODE_ENV=production. */
export function isProductionRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

/**
 * True ONLY for a positively-identified local dev/test runtime. Never on Vercel,
 * and never when NODE_ENV is unset — a bare custom Node server / Docker /
 * standalone build with no NODE_ENV must FAIL CLOSED rather than read as
 * "not production" and silently open the app (auth-perimeter hardening).
 */
export function isLocalDevRuntime(): boolean {
  if (process.env.VERCEL === "1") return false;
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

/** Whether CRON_SECRET is configured. Drives the Settings health signal. */
export function isCronSecretConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET);
}

/**
 * Shared auth check for Vercel cron routes. Vercel automatically sends
 * `Authorization: Bearer ${CRON_SECRET}` when the env var is configured.
 *
 * Fail-closed by default: if no secret is set, only a positively-identified
 * local dev/test runtime stays open (never Vercel, never an unset NODE_ENV).
 */
/** Constant-time token equality — avoids leaking the secret through early-exit
 *  timing on a byte mismatch. Length mismatch is returned directly. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return isLocalDevRuntime();
  return timingSafeEqualStr(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
