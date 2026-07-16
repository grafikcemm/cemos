-- CreateTable
CREATE TABLE "PublishAttempt" (
    "id" TEXT NOT NULL,
    "queueItemId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "readinessPolicyVersion" TEXT NOT NULL,
    "readinessSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "externalId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishAttempt_queueItemId_state_idx" ON "PublishAttempt"("queueItemId", "state");

-- CreateIndex
CREATE INDEX "PublishAttempt_accountId_state_idx" ON "PublishAttempt"("accountId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PublishAttempt_accountId_adapter_idempotencyKey_key" ON "PublishAttempt"("accountId", "adapter", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "QueueItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
