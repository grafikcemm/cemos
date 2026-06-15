-- CreateTable
CREATE TABLE "ViralPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "patternName" TEXT NOT NULL,
    "category" TEXT,
    "hookType" TEXT,
    "structureJson" TEXT NOT NULL DEFAULT '{}',
    "emotion" TEXT NOT NULL DEFAULT '',
    "viralityTrigger" TEXT NOT NULL DEFAULT '',
    "exampleGood" TEXT NOT NULL DEFAULT '',
    "exampleBad" TEXT NOT NULL DEFAULT '',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "successScore" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ViralPattern_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "sourceContent" TEXT,
    "outputContent" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "embeddingJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingExample_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedbackEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "queueItemId" TEXT,
    "sourcePostId" TEXT,
    "feedbackType" TEXT NOT NULL,
    "originalContent" TEXT,
    "editedContent" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvalTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "sourceContent" TEXT,
    "expectedBehavior" TEXT,
    "generatedOutput" TEXT NOT NULL DEFAULT '',
    "score" REAL,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvalTest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
