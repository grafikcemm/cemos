-- Faz 1C: yapısal thread segmentleri (JSON: ThreadSegment[]).
-- ADDITIVE-ONLY: nullable, default yok → non-destructive (mevcut satırlar NULL).
-- Kanıt: prisma migrate diff (schema→schema, offline). Production'a KULLANICI uygular.
-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN     "threadSegments" TEXT;
