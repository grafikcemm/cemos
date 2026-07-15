-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PublishLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "externalId" TEXT,
    "scheduledAt" DATETIME,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublishLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PublishLog" ("accountId", "content", "externalId", "id", "platform", "publishedAt") SELECT "accountId", "content", "externalId", "id", "platform", "publishedAt" FROM "PublishLog";
DROP TABLE "PublishLog";
ALTER TABLE "new_PublishLog" RENAME TO "PublishLog";
CREATE TABLE "new_Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "lastScanAt" DATETIME,
    "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scanCron" TEXT NOT NULL DEFAULT '0 9 * * *',
    "dailyMaxPosts" INTEGER NOT NULL DEFAULT 3,
    "quietStartHour" INTEGER NOT NULL DEFAULT 23,
    "quietEndHour" INTEGER NOT NULL DEFAULT 8,
    "calendarStrategy" TEXT NOT NULL DEFAULT 'manual',
    "lastPublishAt" DATETIME,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Schedule" ("accountId", "cadence", "id", "lastScanAt", "updatedAt") SELECT "accountId", "cadence", "id", "lastScanAt", "updatedAt" FROM "Schedule";
DROP TABLE "Schedule";
ALTER TABLE "new_Schedule" RENAME TO "Schedule";
CREATE UNIQUE INDEX "Schedule_accountId_key" ON "Schedule"("accountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
