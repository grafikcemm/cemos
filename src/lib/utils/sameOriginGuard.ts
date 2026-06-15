import type { NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/utils/cronAuth";

/**
 * CSRF-class guard for operator-triggered mutation routes. Browsers attach
 * Sec-Fetch-Site / Origin automatically, so the app UI keeps working while
 * cross-site pages and drive-by requests get rejected. This intentionally does
 * NOT stop a curl that forges the headers — the goal is "no third-party page
 * can spend our LLM budget via a visitor's browser", not full authentication.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") return true;
  // Some clients omit Sec-Fetch-Site; fall back to comparing the Origin host
  // with the host the request was actually served on (x-forwarded-host on Vercel).
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
    return originHost === requestHost;
  } catch {
    return false;
  }
}

/** Same-origin browser call OR an explicit cron-secret bearer (when configured). */
export function isOperatorOrCronAuthorized(req: NextRequest): boolean {
  if (process.env.CRON_SECRET && isCronAuthorized(req)) return true;
  return isSameOriginRequest(req);
}
