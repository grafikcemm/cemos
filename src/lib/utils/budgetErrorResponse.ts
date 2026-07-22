import type { NextResponse } from "next/server";
import { fail } from "@/lib/utils/apiResponse";
import {
  BudgetExceededError,
  BudgetSystemUnavailableError,
} from "@/lib/config/costGate";

/**
 * Single-source HTTP mapping for the two budget-gate errors, so every gated
 * route distinguishes them identically (mandate: "aynı error mapping" +
 * "budget unavailable semantik 503"):
 *
 * - `BudgetExceededError` → **402** `{ code:"budget" }` — PROVEN over budget.
 *   The call was refused because spend would exceed the cap; permanent until the
 *   month rolls or the limit is raised. NOT retryable.
 *
 * - `BudgetSystemUnavailableError` → **503** `{ code:"budget_unavailable",
 *   retryable:true }` — the budget AUTHORITY itself could not be verified
 *   (reservation table missing, DB unreachable, status read failed). NO spend
 *   happened; the call was refused fail-CLOSED. This is TRANSIENT, so it is
 *   retryable and MUST read differently from "bütçe tükendi" in the UI. The
 *   `detail` on the error (which can embed a DB/internal message) is deliberately
 *   NOT surfaced — the user sees a fixed, safe Turkish message.
 *
 * Returns `null` for anything else so the caller falls through to its own
 * (route-specific) error handling. `extra` merges into the JSON body — used by
 * routes that attach context (e.g. `{ stage }`) without losing it.
 */
export function budgetErrorResponse(
  err: unknown,
  extra?: Record<string, unknown>,
): NextResponse | null {
  if (err instanceof BudgetExceededError) {
    return fail(err.message, 402, { code: "budget", ...extra });
  }
  if (err instanceof BudgetSystemUnavailableError) {
    // Fixed, retryable, secret-free message. The 503 status + distinct `code`
    // let the client show "AI bütçe sistemi geçici olarak kullanılamıyor"
    // (system down) rather than "bütçe tükendi" (over budget) — and the client
    // keys retry on `code`, never auto-looping.
    return fail(
      "AI bütçe sistemi geçici olarak kullanılamıyor. Harcama yapılmadı; lütfen biraz sonra tekrar deneyin.",
      503,
      { code: "budget_unavailable", retryable: true, ...extra },
    );
  }
  return null;
}
