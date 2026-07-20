-- Closure C: atomic AI-spend reservation to close the budget TOCTOU.
--
-- The gate reserves an estimated cost under an advisory lock BEFORE the provider
-- call, settles it to the actual cost after (or releases it on failure), and
-- getBudgetStatus counts open (unexpired) reservations. Two concurrent essential
-- calls therefore can't both read the same pre-spend total and both overshoot the
-- monthly / pacing / class cap.
--
-- Additive-only: one brand-new table + two indexes. No ALTER on any existing
-- table, no DROP/TRUNCATE, no ALTER TYPE, no rename, no backfill. The runtime
-- fail-opens to the legacy assertGenerationAllowed when this table is absent, so
-- deploying the code before this migration is applied is safe.

-- CreateTable
CREATE TABLE "AiSpendReservation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "budgetClass" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL,
    "actualCostUsd" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'open',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "AiSpendReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSpendReservation_status_expiresAt_idx" ON "AiSpendReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AiSpendReservation_createdAt_idx" ON "AiSpendReservation"("createdAt");
