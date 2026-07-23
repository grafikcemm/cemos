/**
 * WP-02f — unit suite'in YAPISAL DB koruması. E2E (e2eEnv) ve itest (guard.ts)
 * katmanlarının fail-closed korumasının unit karşılığı: vitest global setup'ı
 * bu modülle (1) ortamdan sızan UZAK bir DATABASE_URL'i REDDEDER (test hiç
 * başlamaz), (2) her koşuda bilinen-yerel bir dummy URL'e sabitler — böylece
 * mock'lanmamış bir prisma yolu en kötü ihtimalle 127.0.0.1'e ECONNREFUSED olur,
 * ASLA Neon/Supabase/uzak Postgres'e paket atamaz.
 */

const REMOTE_DB_HOST_PATTERN =
  /(neon\.tech|supabase\.(?:co|com|in)|vercel-storage|amazonaws\.com|azure|googleapis|render\.com|fly\.dev|railway\.app|digitalocean)/i;

const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/i;

// connect_timeout=1: kapalı porta Prisma, pencere boyunca yeniden dener —
// paramsız pencere (client.ts 20 sn) mock'lanmamış bir DB dokunuşunu test
// timeout'una asar. 1 sn'lik taban dokunuşu HIZLI ve GÖRÜNÜR kılar (ölçüldü:
// ~1015 ms PrismaClientInitializationError, 127.0.0.1'e sıfır dış paket).
export const UNIT_DUMMY_DATABASE_URL =
  "postgresql://cemos_unit:cemos_unit@127.0.0.1:5432/cemos_unit_dummy?connect_timeout=1&pool_timeout=1";

/**
 * Uzak/prod görünümlü bir bağlantı dizesi mi? Parse edilemeyen ama uzak-host
 * kalıbı içeren değerler de UZAK sayılır (fail-closed).
 */
export function isRemoteDatabaseUrl(url: string | undefined | null): boolean {
  if (!url || url.trim() === "") return false;
  if (REMOTE_DB_HOST_PATTERN.test(url)) return true;
  try {
    const host = new URL(url).hostname;
    return host !== "" && !LOCAL_HOST_PATTERN.test(host);
  } catch {
    // Parse edilemedi ve bilinen uzak kalıbı yok → dummy override zaten ezecek.
    return false;
  }
}

/**
 * Global setup girişi: uzak URL görürse THROW (suite başlamaz — sessizce yerel
 * dummy'ye düşmek, "prod'a bağlanacaktı" sinyalini yutardı); değilse dummy'yi
 * sabitler. Dönüş değeri test edilebilirlik içindir.
 */
export function enforceUnitDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const current = env.DATABASE_URL;
  if (isRemoteDatabaseUrl(current)) {
    throw new Error(
      "Unit suite REMOTE bir DATABASE_URL ile başlatıldı (Neon/Supabase/uzak Postgres). " +
        "Unit testler gerçek veritabanına ASLA bağlanamaz — ortam değişkenini kaldırın. " +
        "(Gerçek-PG entegrasyonu için opt-in vitest.integration.config.ts katmanı var.)",
    );
  }
  env.DATABASE_URL = UNIT_DUMMY_DATABASE_URL;
  return UNIT_DUMMY_DATABASE_URL;
}
