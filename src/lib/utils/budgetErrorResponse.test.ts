import { describe, it, expect } from "vitest";
import { budgetErrorResponse } from "@/lib/utils/budgetErrorResponse";
import {
  BudgetExceededError,
  BudgetSystemUnavailableError,
} from "@/lib/config/costGate";

describe("budgetErrorResponse", () => {
  it("maps BudgetExceededError → 402 { code:'budget' } (proven over budget, not retryable)", async () => {
    const res = budgetErrorResponse(new BudgetExceededError(1.23, 2, "monthly_limit"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(402);
    const json = await res!.json();
    expect(json).toMatchObject({ success: false, code: "budget" });
    expect(json.retryable).toBeUndefined();
  });

  it("maps BudgetSystemUnavailableError → 503 { code:'budget_unavailable', retryable:true }", async () => {
    const res = budgetErrorResponse(new BudgetSystemUnavailableError("db unreachable"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const json = await res!.json();
    expect(json).toMatchObject({
      success: false,
      code: "budget_unavailable",
      retryable: true,
    });
    // Distinct, user-safe Turkish message — NOT "bütçe tükendi".
    expect(json.error).toContain("geçici olarak kullanılamıyor");
    // The internal detail must never reach the user-facing message.
    expect(json.error).not.toContain("db unreachable");
  });

  it("merges extra fields (e.g. stage) into either mapping without losing them", async () => {
    const over = budgetErrorResponse(new BudgetExceededError(1, 2), { stage: "translate" });
    expect((await over!.json())).toMatchObject({ code: "budget", stage: "translate" });
    const down = budgetErrorResponse(new BudgetSystemUnavailableError("x"), { stage: "score" });
    expect((await down!.json())).toMatchObject({ code: "budget_unavailable", stage: "score" });
  });

  it("returns null for any non-budget error so the caller keeps its own handling", () => {
    expect(budgetErrorResponse(new Error("boom"))).toBeNull();
    expect(budgetErrorResponse("string error")).toBeNull();
    expect(budgetErrorResponse(null)).toBeNull();
    expect(budgetErrorResponse(undefined)).toBeNull();
  });
});
