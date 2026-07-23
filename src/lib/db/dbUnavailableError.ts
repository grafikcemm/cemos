/**
 * WP-01 (FINAL-OPERATIONAL-CLOSURE-PLAN §10) — merkezi DB-unavailable
 * sınıflandırıcısı. SAF modül: runtime import'u YOK (apiResponse hem bu modülü
 * hem fail()'i kullanır; döngü olmaması için sınıflandırma burada, HTTP mapping
 * `dbErrorResponse`'ta yaşar).
 *
 * "Unavailable" = bağlantı/kota/uyanma sınıfı — kod hatası DEĞİL, geçici altyapı
 * durumu. Bu sınıf route'larda 500 yerine yapılandırılmış
 * `503 {code:"db_unavailable", retryable:true}` üretir (budgetErrorResponse
 * aynası). Sorgu-düzeyi Prisma hataları (P2002 unique, P2025 not-found, şema
 * hataları) BİLEREK kapsam dışıdır — onlar gerçek 4xx/5xx yollarında kalır.
 */

/** Prisma hata kodları: bağlantı kurulamadı / zaman aşımı / havuz tükendi. */
const DB_UNAVAILABLE_PRISMA_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // reached but timed out
  "P1008", // operations timed out
  "P1017", // server has closed the connection
  "P2024", // timed out fetching a new connection from the pool
]);

/**
 * Mesaj kalıpları: YALNIZ Prisma/Postgres/Neon'a özgü metinler (2026-07-23 canlı
 * kanıt: "exceeded the data transfer quota"). Çıplak Node socket kodları
 * (ECONNREFUSED/ETIMEDOUT/ENOTFOUND…) BİLEREK YOK: dış sağlayıcı fetch'leri
 * (OpenRouter/Meta/YouTube DNS kesintisi) aynı kodları taşır ve onları DB-down
 * saymak hem yanlış 503 hem paylaşılan breaker'ı kirletip global bandı yalancı
 * yapar (PR #6 review HIGH-1). Prisma'nın kendi bağlantı hataları zaten
 * name/`code`/aşağıdaki metinlerle yakalanır — socket koduna gerek yok.
 * Türkçe sabit kullanıcı mesajları bu kalıplara ASLA uymaz → coercion döngüsü yok.
 */
const DB_UNAVAILABLE_MESSAGE_PATTERNS: RegExp[] = [
  /can't reach database server/i,
  /database server (?:at|is running)/i,
  /timed out fetching a new connection/i,
  /server has closed the connection/i,
  /exceeded the (?:data transfer|compute time) quota/i,
  /endpoint (?:is|has been) disabled/i,
];

/** İstemciye dönen SABİT, secret'sız mesaj (ham Prisma metni asla geçmez). */
export const DB_UNAVAILABLE_MESSAGE =
  "Veritabanına şu anda erişilemiyor. Veriler geçici olarak yüklenemiyor; bağlantı geri geldiğinde kendiliğinden düzelir.";

/** Ham hata METNİ DB-unavailable kalıbına uyuyor mu? (fail() choke-point emniyeti) */
export function isDbUnavailableMessage(message: string): boolean {
  if (typeof message !== "string" || message.length === 0) return false;
  return DB_UNAVAILABLE_MESSAGE_PATTERNS.some((p) => p.test(message));
}

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  cause?: unknown;
};

/**
 * Hata NESNESİ bilinen DB-unavailable sınıfında mı? Ad (init error), Prisma
 * `code` alanı ve mesaj kalıpları kontrol edilir; `cause` zinciri en fazla 3
 * seviye yürünür (fetch/undici sarmalayıcıları için).
 */
export function isDbUnavailableError(err: unknown, depth = 0): boolean {
  if (depth > 3 || typeof err !== "object" || err === null) return false;
  const e = err as ErrorLike;
  // instanceof DEĞİL name-check: webpack bundle'ları Prisma sınıfını iki kez
  // paketleyebilir; ad karşılaştırması bundling'den bağımsız çalışır.
  if (e.name === "PrismaClientInitializationError") return true;
  if (typeof e.code === "string" && DB_UNAVAILABLE_PRISMA_CODES.has(e.code)) return true;
  if (typeof e.message === "string" && isDbUnavailableMessage(e.message)) return true;
  if (e.cause) return isDbUnavailableError(e.cause, depth + 1);
  return false;
}
