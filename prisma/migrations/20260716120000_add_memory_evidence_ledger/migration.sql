-- AlterTable
ALTER TABLE "MemoryFact" ADD COLUMN     "canonicalKey" TEXT;

-- CreateTable
CREATE TABLE "MemoryEvidence" (
    "id" TEXT NOT NULL,
    "memoryFactId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryEvidence_memoryFactId_createdAt_idx" ON "MemoryEvidence"("memoryFactId", "createdAt");

-- CreateIndex
CREATE INDEX "MemoryEvidence_sourceType_sourceId_idx" ON "MemoryEvidence"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryEvidence_memoryFactId_sourceType_sourceId_signalType_key" ON "MemoryEvidence"("memoryFactId", "sourceType", "sourceId", "signalType");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryFact_canonicalKey_key" ON "MemoryFact"("canonicalKey");

-- AddForeignKey
ALTER TABLE "MemoryEvidence" ADD CONSTRAINT "MemoryEvidence_memoryFactId_fkey" FOREIGN KEY ("memoryFactId") REFERENCES "MemoryFact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
