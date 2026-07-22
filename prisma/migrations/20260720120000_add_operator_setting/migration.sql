-- Phase 5F (§6): durable, server-authoritative operator settings. Fixes the
-- MODEL_PROFILE "success lie" — the old POST wrote .env.local, which on Vercel
-- is a read-only FS outside /tmp and is not re-read per request, so the UI
-- reported success while production routing never changed and the choice was
-- lost on the next cold start.
--
-- Additive-only: a single brand-new table. No ALTER on any existing table, no
-- DROP/TRUNCATE, no ALTER TYPE, no rename, no backfill, no data rewrite. The
-- runtime reads it fail-open (table-missing → env fallback), so deploying the
-- code before this migration is applied is safe.

-- CreateTable
CREATE TABLE "OperatorSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorSetting_pkey" PRIMARY KEY ("key")
);
