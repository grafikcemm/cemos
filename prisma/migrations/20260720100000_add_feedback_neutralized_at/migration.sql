-- Phase 5B (ADR-045): operatörün "yanlış öğrenme sinyalini etkisizleştirme"
-- yeteneği için FeedbackEvent'e opsiyonel neutralizedAt. Set edilince köprü
-- (signalBridge.reconcileFeedbackSignals) bu event'i GELECEK hafıza önerilerine
-- SOKMAZ; ham kayıt silinmez (audit korunur). Additive-only: nullable ADD COLUMN
-- (data rewrite yok, tüm mevcut satırlar NULL = etkin). DROP/TRUNCATE/ALTER TYPE/
-- backfill/rename/UNIQUE YOK.

-- AlterTable
ALTER TABLE "FeedbackEvent" ADD COLUMN     "neutralizedAt" TIMESTAMP(3);
