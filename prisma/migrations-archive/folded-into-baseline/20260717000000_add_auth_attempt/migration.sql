-- Faz 1A erişim-kapısı throttling: kalıcı DB-backed sayaç. HMAC(ip) anahtarı
-- (ham IP saklanmaz). ADDITIVE-ONLY, non-destructive.
--
-- NOT (DB durumu): bu repoda `migration_lock.toml = sqlite` (dev orijini) fakat
-- canlı DB PostgreSQL/Neon ve `db push` ile kurulmuş → migration geçmişi
-- provider-uyumsuz, `prisma migrate deploy` uygulanamaz. Bu additive DDL canlı
-- DB'ye `prisma db execute` ile UYGULANDI. `IF NOT EXISTS` → db-push ile zaten
-- var olan tabloyu/kolonu BOZMAZ (idempotent). Migration geçmişini postgres'e
-- baseline'lamak (destructive olabilir) ayrı bir kullanıcı kararıdır.

CREATE TABLE IF NOT EXISTS "AuthAttempt" (
    "id" TEXT NOT NULL,
    "ipKey" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthAttempt_ipKey_key" ON "AuthAttempt"("ipKey");
CREATE INDEX IF NOT EXISTS "AuthAttempt_updatedAt_idx" ON "AuthAttempt"("updatedAt");
