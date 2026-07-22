# Migration Arşivi (Faz 1C.2 — PostgreSQL baseline)

Bu dizin Prisma'nın **aktif migration path'i dışındadır** (`prisma.config.ts` →
`migrations.path = "prisma/migrations"`). Prisma bu dosyaları okumaz; yalnızca
tarihsel kayıt ve non-destructive kanıt içindir. Hiçbir dosya silinmedi.

## Neden baseline?

Canlı Neon PostgreSQL DB geçmişte `prisma db push` ile kurulmuştu → `_prisma_migrations`
tablosu yoktu. Yerel `prisma/migrations/` zinciri ise **SQLite-orijinli** dev
migrationlarından oluşuyordu (`migration_lock.toml = sqlite`, inline `PRIMARY KEY`,
`DATETIME`, `PRAGMA`). Datasource `postgresql` olduğundan `prisma migrate status`
kalıcı olarak **P3019** (provider uyuşmazlığı) veriyordu ve `prisma migrate deploy`
uygulanamıyordu.

## Uygulanan strateji (non-destructive)

1. Read-only kanıt: `prisma migrate diff --from-schema-datasource → --to-schema-datamodel`
   = **"No difference detected."** → canlı şema, `schema.prisma` datamodel'iyle birebir.
2. Tek postgres baseline üretildi: `prisma/migrations/0_init/migration.sql`
   (`migrate diff --from-empty --to-schema-datamodel --script`) — 71 tablo = 71 model.
3. `migration_lock.toml` → `postgresql`.
4. Canlı DB'ye baseline SQL **çalıştırılmadı**; `prisma migrate resolve --applied 0_init`
   ile mevcut canlı şema baseline'a bağlandı (yalnızca `_prisma_migrations`'a satır yazar,
   DDL çalıştırmaz).

## Arşiv içeriği

### `sqlite-origin/`
Orijinal dev migration zinciri (SQLite sözdizimi). Baseline bunların birikmiş
sonucunu (postgres olarak) tek dosyada temsil eder.
- `20260520093338_init`, `20260520102146_add_lint_report`, `20260520102326_extend_schedule`,
  `20260528000000_growth_engine_init`, `20260622000000_content_intelligence_init`
- `migration_lock.toml` (orijinal, `provider = sqlite`)

### `folded-into-baseline/`
Faz 1C.1'de üretilen **postgres additive** migrationlar. DDL'leri artık `0_init`
baseline'ına dahil (threadSegments kolonu + AuthAttempt tablosu/indexleri). Ayrı
migration olarak tutulsalardı `0_init` üstünde tekrar çalışıp fresh-apply'ı bozarlardı
(`add_thread_segments` `IF NOT EXISTS` kullanmıyor). Canlı DB'ye zaten `prisma db execute`
ile uygulanmışlardı; DB durumu değişmedi.
- `20260716000000_add_thread_segments`, `20260717000000_add_auth_attempt`
