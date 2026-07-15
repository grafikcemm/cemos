-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "handle" TEXT NOT NULL,
    "xHandle" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "maxChars" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StyleProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "toneRules" TEXT NOT NULL,
    "formatRules" TEXT NOT NULL,
    "forbiddenRules" TEXT NOT NULL,
    "modes" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StyleProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'TWEET',
    "thresholdLikes" INTEGER NOT NULL DEFAULT 10,
    "thresholdRetweets" INTEGER NOT NULL DEFAULT 2,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Source_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourcePost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "retweetCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "viralScore" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "opportunityScore" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'new',
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourcePost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SourcePost_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "sourcePostId" TEXT,
    "content" TEXT NOT NULL,
    "editedContent" TEXT,
    "draftType" TEXT NOT NULL DEFAULT 'TWEET',
    "mode" TEXT NOT NULL DEFAULT 'ai_news',
    "status" TEXT NOT NULL DEFAULT 'new',
    "scheduledAt" DATETIME,
    "publishedAt" DATETIME,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "usedMock" BOOLEAN NOT NULL DEFAULT false,
    "scores" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QueueItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QueueItem_sourcePostId_fkey" FOREIGN KEY ("sourcePostId") REFERENCES "SourcePost" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "lastScanAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "sourcesScanned" INTEGER NOT NULL DEFAULT 0,
    "tweetsFound" INTEGER NOT NULL DEFAULT 0,
    "postsInserted" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "errors" TEXT NOT NULL DEFAULT '[]',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "ScanRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "queueItemId" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "usedMock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GenerationRun_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "QueueItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT,
    "type" TEXT NOT NULL,
    "tweetCount" INTEGER,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublishLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "externalId" TEXT,
    CONSTRAINT "PublishLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_handle_key" ON "Account"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "StyleProfile_accountId_key" ON "StyleProfile"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_accountId_handle_key" ON "Source"("accountId", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePost_tweetId_key" ON "SourcePost"("tweetId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_accountId_key" ON "Schedule"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationRun_queueItemId_key" ON "GenerationRun"("queueItemId");
