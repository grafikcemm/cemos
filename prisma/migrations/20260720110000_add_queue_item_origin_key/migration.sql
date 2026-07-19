-- Phase 5B (ADR-045): deterministik "fikir → taslak" köprüsü için QueueItem'a
-- opsiyonel originKey + NULL-distinct unique index. Çift-tık/retry idempotency'si:
-- client değil, SERVER key üretir ("learn:{packId}:{ideaId}:{accountId}" |
-- "idea:{ideaId}") → pre-check + P2002 backstop mevcut taslağı döner (duplicate
-- queue item YOK). Additive-only: nullable ADD COLUMN (data rewrite yok, tüm
-- mevcut satırlar NULL) + nullable kolon üzerinde UNIQUE INDEX (Postgres NULL'ları
-- ayrık sayar → cron/pipeline taslakları serbest çoğaltılır). DROP/TRUNCATE/
-- ALTER TYPE/backfill/rename YOK.

-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN     "originKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "QueueItem_originKey_key" ON "QueueItem"("originKey");
