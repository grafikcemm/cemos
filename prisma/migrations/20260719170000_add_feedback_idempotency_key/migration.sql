-- Phase 5A (ADR-044): açık geri bildirim (thumbs/reason-chip/note) çift-tık/retry
-- idempotency'si için FeedbackEvent'e opsiyonel idempotencyKey + NULL-distinct
-- unique index. Client key üretir → sunucu pre-check + P2002 backstop
-- (LearnReviewAttempt/PublishAttempt deseni). Additive-only: nullable ADD COLUMN
-- (data rewrite yok) + nullable kolon üzerinde UNIQUE INDEX (Postgres NULL'ları
-- ayrık sayar → tüm mevcut satırlar NULL, çakışma yok). DROP/TRUNCATE/ALTER TYPE/
-- backfill/rename YOK.

-- AlterTable
ALTER TABLE "FeedbackEvent" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackEvent_idempotencyKey_key" ON "FeedbackEvent"("idempotencyKey");
