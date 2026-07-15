-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "QueueItem" ADD COLUMN "bufferUpdateId" TEXT;
ALTER TABLE "QueueItem" ADD COLUMN "lastError" TEXT;
ALTER TABLE "QueueItem" ADD COLUMN "lintReport" TEXT;
