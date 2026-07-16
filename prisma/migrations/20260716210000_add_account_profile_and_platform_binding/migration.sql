-- Phase 2C (ADR-031/032) — pure additive:
--   * Account: profile source-of-truth kolonları (hepsi DEFAULT'lu → mevcut satırlar geçerli kalır)
--   * AccountPlatformBinding: hesap ↔ platform bağlantı eşlemesi (credential/token TUTMAZ)
-- DROP / TRUNCATE / destructive ALTER yok.

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "autonomy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "benchmarkInput" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "defaultDraftCount" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "displayName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "formatsJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'Turkish',
ADD COLUMN     "profileStatus" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "profileUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "profileVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "AccountPlatformBinding" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL DEFAULT '',
    "externalHandle" TEXT NOT NULL DEFAULT '',
    "connectionStatus" TEXT NOT NULL DEFAULT 'unverified',
    "toolkitVersion" TEXT NOT NULL DEFAULT '',
    "lastVerifiedAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorClass" TEXT NOT NULL DEFAULT '',
    "lastSyncSummaryJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPlatformBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountPlatformBinding_platform_provider_idx" ON "AccountPlatformBinding"("platform", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPlatformBinding_accountId_platform_provider_key" ON "AccountPlatformBinding"("accountId", "platform", "provider");

-- AddForeignKey
ALTER TABLE "AccountPlatformBinding" ADD CONSTRAINT "AccountPlatformBinding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
