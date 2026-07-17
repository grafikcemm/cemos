# DB-SAFETY — Production Veritabanı Güvenlik Prosedürü (BAĞLAYICI)

> Kaynak olay: **2026-07-17** — `prisma migrate diff --shadow-database-url`'e
> production Neon URL'i geçirildi ve production veritabanı SIFIRLANDI (komut,
> shadow hedefini reset eder; read-only DEĞİLDİR). Veri Neon PITR ile
> 2026-07-17 09:15 UTC noktasından tam kurtarıldı. Bu belge + kod korkulukları
> (ADR-035) tekrarını engeller.

## Mutlak yasaklar (production `DATABASE_URL` ile ASLA)

- `prisma migrate diff --shadow-database-url <URL>` — shadow hedefi RESET edilir.
- `prisma migrate dev` — shadow DB ister, migrate diff ailesi.
- `prisma db push` — `npm run db:push` artık guard'lıdır; production-benzeri
  URL'de **reddeder** (`scripts/guarded-db-push.ts`).
- `prisma migrate reset`, herhangi bir `DROP` / `TRUNCATE` / destructive baseline.
- Production'ı shadow/scratch DB olarak kullanan HERHANGİ bir komut.

## Production şema değişikliği — tek geçerli yol

1. **Önce read-only snapshot**: satır sayıları + ilgili veri (`npm run db:migrate`
   bunu otomatik yapar; elle: `scripts/check-db.ts`).
2. **Migration SQL'ini ELLE yaz**: `prisma/migrations/<timestamp>_<name>/migration.sql`.
   Otomatik diff üretimi yok.
3. **Statik incele**: `npm run db:migrate:scan` — `DROP/TRUNCATE/ALTER..TYPE/
   koşulsuz DELETE` kalıpları bulunursa deploy reddedilir. Statik tarama insan
   incelemesinin YERİNE geçmez; SQL'i satır satır oku.
4. **Yalnız additive**: yeni tablo, yeni default'lu kolon, yeni index, FK.
5. **`npm run db:migrate`** → `prisma migrate deploy` (shadow DB kullanmaz).
6. Script ikinci deploy'da **"No pending migrations"** doğrular (idempotency).
7. Script sonrası snapshot'ı karşılaştırır — satır kaybı = hata çıkışı.
8. `npx prisma migrate status` clean olmalı.

## Kod korkulukları (ADR-035)

- `src/lib/db/urlSafety.ts` — saf sınıflandırıcı:
  - `classifyDatabaseUrl` fail-closed: yalnız localhost/127.0.0.1/`*.local`/file:
    ephemeral; diğer her host production-benzeri.
  - `assertSafeShadowUrl` — production-benzeri veya ana-DB-host'lu shadow → throw.
  - `assertSafeDbPushTarget` — production-benzeri hedefe push → throw.
  - `scanMigrationSqlForDestructiveOps` — statik SQL taraması.
  - Hata mesajları/fingerprint asla credential/query/parola içermez.
- Testler yalnız SAHTE URL kullanır (`urlSafety.test.ts`); guard production'a
  karşı destructive komut çalıştırılarak TEST EDİLMEZ.

## Olay müdahale runbook'u (veri kaybı şüphesi)

1. **DUR** — başka hiçbir DB komutu çalıştırma (özellikle migration/push).
2. Read-only teşhis: satır sayıları, `_prisma_migrations` içeriği.
3. Neon Console → Backup & Restore → **Preview data** ile hedef zaman
   noktasındaki veriyi read-only doğrula (beklenen satır sayıları).
4. Beklenen veri görünüyorsa **Restore** (kullanıcı onayı zorunlu). Eski durum
   `production_old_<timestamp>` branch'i olarak saklanır — hemen SİLME.
5. Restore sonrası read-only doğrulama: satır sayıları + kritik parmak izleri
   (ör. segmentli thread sayısı).
6. Credential terminale düz metin yazıldıysa: DB parolası rotasyonu + Vercel/
   local env güncellemesi (kullanıcı aksiyonu).
7. Olayı DECISIONS.md + memory'ye işle.

## Notlar

- Neon Free plan PITR penceresi ~6 saat — olay tespiti geciktikçe kurtarma şansı düşer.
- `production_old_2026-07-17T09:15:00Z` yedek branch'i kullanıcı silene dek durur.
- Fingerprint loglamak gerekirse yalnız `sanitizeDbHostFingerprint` çıktısı.
