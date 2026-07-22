/**
 * Startup secret assertion (FIRST-SPRINT item 18; ADR-049 güncellemesi).
 *
 * İSİM-BAZLI fail-fast: eksik zorunlu secret'lar isimleriyle raporlanır ve
 * production'da başlatma durdurulur. Secret DEĞERLERİ asla loglanmaz,
 * hata mesajına yazılmaz, hiçbir yere aktarılmaz.
 */

/** Her ortamda zorunlu — yoksa uygulama anlamlı çalışamaz. */
const REQUIRED_ALWAYS = ["DATABASE_URL"] as const;

/**
 * Production'da (Vercel / NODE_ENV=production) zorunlu. Dev'de eksikse yalnız
 * isim listesiyle uyarılır — mock/fallback yollar bilinçli olarak açık kalır.
 */
const REQUIRED_IN_PRODUCTION = [
  "OPENROUTER_API_KEY",
  "CRON_SECRET",
  "CREDENTIAL_ENC_KEY",
  // ADR-049 "Sign in with Vercel" (OIDC) tek-operatör erişim kapısı: prod'da
  // zorunlu. SESSION_SECRET session HMAC'ini imzalar; client id/secret OIDC
  // akışını; AUTH_ALLOWED_VERCEL_USERS ise allow-list'i besler (boşsa kimse
  // giremez → fail-closed). Dev'de eksikse uyarılır (kapı kapalı kalır).
  "SESSION_SECRET",
  "NEXT_PUBLIC_VERCEL_APP_CLIENT_ID",
  "VERCEL_APP_CLIENT_SECRET",
  "AUTH_ALLOWED_VERCEL_USERS",
] as const;

function isProductionRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export function findMissingSecrets(): { fatal: string[]; warned: string[] } {
  const missing = (names: readonly string[]) =>
    names.filter((name) => {
      const value = process.env[name];
      return typeof value !== "string" || value.trim().length === 0;
    });

  const alwaysMissing = missing(REQUIRED_ALWAYS);
  const prodMissing = missing(REQUIRED_IN_PRODUCTION);

  if (isProductionRuntime()) {
    return { fatal: [...alwaysMissing, ...prodMissing], warned: [] };
  }
  return { fatal: alwaysMissing, warned: prodMissing };
}

/**
 * Eksik zorunlu secret → isim vererek throw (fail-fast). Yalnız isimler —
 * değer, uzunluk, prefix dahil hiçbir değer türevi loglanmaz.
 */
export function assertRequiredSecrets(): void {
  const { fatal, warned } = findMissingSecrets();

  if (warned.length > 0) {
    console.warn(
      `[startup] Eksik secret (dev'de uyarı, production'da fatal): ${warned.join(", ")}`,
    );
  }

  if (fatal.length > 0) {
    throw new Error(
      `Eksik zorunlu secret: ${fatal.join(", ")}. ` +
        "Ortam değişkenlerini tanımlamadan uygulama başlatılamaz.",
    );
  }
}
