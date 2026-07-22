-- CreateTable
CREATE TABLE "OpportunityHandoff" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "topicSeed" TEXT NOT NULL DEFAULT '',
    "whyNow" TEXT NOT NULL DEFAULT '',
    "whyNowDetail" TEXT NOT NULL DEFAULT '',
    "rawTab" TEXT NOT NULL DEFAULT '',
    "suggestedPlatform" TEXT NOT NULL DEFAULT 'X',
    "score" INTEGER NOT NULL DEFAULT 0,
    "curationMethod" TEXT NOT NULL DEFAULT 'deterministic',
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "fingerprint" TEXT NOT NULL,
    "resultQueueItemId" TEXT,
    "resultRef" TEXT,
    "blockedReason" TEXT,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpportunityHandoff_accountId_action_status_idx" ON "OpportunityHandoff"("accountId", "action", "status");

-- CreateIndex
CREATE INDEX "OpportunityHandoff_status_createdAt_idx" ON "OpportunityHandoff"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityHandoff_accountId_action_fingerprint_key" ON "OpportunityHandoff"("accountId", "action", "fingerprint");

-- AddForeignKey
ALTER TABLE "OpportunityHandoff" ADD CONSTRAINT "OpportunityHandoff_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
