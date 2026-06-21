-- Faz C: content atomization linkage (additive, nullable).
-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN "packageId" TEXT,
ADD COLUMN "packageRole" TEXT;

-- CreateIndex
CREATE INDEX "QueueItem_packageId_idx" ON "QueueItem"("packageId");
