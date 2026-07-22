-- 4C-H: LearnReviewAttempt çift-gönderim koruması (additive, non-destructive).
-- idempotencyKey nullable + unique index. PostgreSQL NULL-distinct → key'siz
-- (legacy/opsiyonel) denemeler serbest çoğaltılabilir; yalnız aynı non-null key tekilleşir.
ALTER TABLE "LearnReviewAttempt" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "LearnReviewAttempt_idempotencyKey_key" ON "LearnReviewAttempt"("idempotencyKey");
