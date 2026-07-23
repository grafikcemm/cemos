import type { NextResponse } from "next/server";
import { fail } from "@/lib/utils/apiResponse";
import {
  isDbUnavailableError,
  DB_UNAVAILABLE_MESSAGE,
} from "@/lib/db/dbUnavailableError";
import { recordDbFailure } from "@/lib/db/dbCircuit";
import { redactError } from "@/lib/utils/redactSecrets";

/**
 * WP-01 — `budgetErrorResponse` aynası: bilinen DB-unavailable hatalarının TEK
 * kaynaklı HTTP mapping'i. Route catch'leri budget kontrolünden sonra bunu
 * çağırır; eşleşirse yapılandırılmış, secret'sız, SABİT mesajlı
 * **503 `{code:"db_unavailable", retryable:true}`** döner (beklenmeyen 500
 * değil). Eşleşmezse `null` → route kendi (route-özel) hata yoluna düşer.
 *
 * Yan etkiler:
 * - instance-yerel circuit breaker'a failure kaydı (health probe + istemci
 *   backoff sinyali bundan beslenir);
 * - server-side REDAKTE log — SEC-L2. Aynı instance'ta en fazla dakikada bir
 *   satır: DB-down fırtınasında logların kendisi fırtınaya dönüşmez.
 */

const LOG_INTERVAL_MS = 60_000;
let lastLogAtMs = 0;

export function dbErrorResponse(
  err: unknown,
  extra?: Record<string, unknown>,
): NextResponse | null {
  if (!isDbUnavailableError(err)) return null;
  recordDbFailure();
  const now = Date.now();
  if (now - lastLogAtMs >= LOG_INTERVAL_MS) {
    lastLogAtMs = now;
    console.error("[db-unavailable]", redactError(err));
  }
  return fail(DB_UNAVAILABLE_MESSAGE, 503, {
    code: "db_unavailable",
    retryable: true,
    ...extra,
  });
}

/** Yalnız test izolasyonu için (log rate-limit state'i). */
export function __resetDbErrorLogForTests(): void {
  lastLogAtMs = 0;
}
