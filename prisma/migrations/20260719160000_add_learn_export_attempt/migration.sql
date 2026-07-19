-- LearnExportAttempt (4D): Obsidian export kalıcı audit + idempotency. ADDITIVE ONLY —
-- yeni tablo + index + FK; mevcut tablolara DOKUNMAZ. DROP/ALTER/DELETE yok.

-- CreateTable
CREATE TABLE "LearnExportAttempt" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "targetFingerprint" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "writtenCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "errorClass" TEXT,
    "idempotencyKey" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "LearnExportAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearnExportAttempt_packId_channel_idx" ON "LearnExportAttempt"("packId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "LearnExportAttempt_packId_channel_targetFingerprint_manifes_key" ON "LearnExportAttempt"("packId", "channel", "targetFingerprint", "manifestHash");

-- CreateIndex
CREATE UNIQUE INDEX "LearnExportAttempt_idempotencyKey_key" ON "LearnExportAttempt"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "LearnExportAttempt" ADD CONSTRAINT "LearnExportAttempt_packId_fkey" FOREIGN KEY ("packId") REFERENCES "LearnPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
