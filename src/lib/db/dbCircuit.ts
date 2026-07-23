/**
 * WP-01 — instance-yerel DB circuit breaker (FINAL-OPERATIONAL-CLOSURE-PLAN §10).
 *
 * Amaç: DB erişilemezken tekrarlayan probe/istek maliyetini SINIRLAMAK.
 * Serverless'ta her lambda instance'ının kendi state'i vardır — bu bilinçli bir
 * sınırdır (paylaşılan store DB'nin kendisi olurdu; DB kapalıyken erişilemez).
 * Instance içinde: ardışık N sınıflandırılmış DB-unavailable hatası breaker'ı
 * AÇAR; açıkken healthService DB probe'u ATLANIR (3×20 saniyelik connect-timeout
 * merdiveni koşulmaz) ve durum health payload'una yazılır → istemci
 * (SystemHealthProvider) tek sinyalden backoff uygular.
 *
 * Half-open: `openUntilMs` geçince breaker kapalı sayılır; SIRADAKİ gerçek
 * deneme başarısızsa iki kat süreyle yeniden açılır (exponential backoff,
 * 5 dakika tavan); başarı TÜM state'i sıfırlar.
 *
 * NOT: Route'lar Prisma çağrısı ÖNCESİ breaker'a bakmaz — DB döner dönmez ilk
 * gerçek istek başarılı olmalı (false-positive bloklama riski yok). Bounded'lık
 * istemci tarafında (tek health sinyali + event-driven fetch) sağlanır.
 */

const FAILURE_THRESHOLD = 3;
const BASE_OPEN_MS = 30_000; // 30 saniye
const MAX_OPEN_MS = 5 * 60_000; // 5 dakika tavan

let consecutiveFailures = 0;
let openUntilMs = 0;
/** Araya başarı girmeden kaçıncı açılış (backoff üssü). */
let openStreak = 0;

export function isDbCircuitOpen(nowMs: number = Date.now()): boolean {
  return nowMs < openUntilMs;
}

/** Sınıflandırılmış DB-unavailable hatasında çağrılır (dbErrorResponse / health probe). */
export function recordDbFailure(nowMs: number = Date.now()): void {
  consecutiveFailures += 1;
  // Breaker zaten açıkken gelen hatalar süreyi UZATMAZ — yoksa yoğun trafik
  // half-open penceresini sonsuza dek öteler ve DB dönüşü hiç fark edilmez.
  if (consecutiveFailures >= FAILURE_THRESHOLD && nowMs >= openUntilMs) {
    const openMs = Math.min(BASE_OPEN_MS * 2 ** openStreak, MAX_OPEN_MS);
    openUntilMs = nowMs + openMs;
    openStreak += 1;
  }
}

/** Başarılı DB teması (health probe) TÜM state'i sıfırlar. */
export function recordDbSuccess(): void {
  consecutiveFailures = 0;
  openUntilMs = 0;
  openStreak = 0;
}

export type DbCircuitState = {
  open: boolean;
  consecutiveFailures: number;
  /** Açıksa: yeniden deneme için kalan saniye (istemci backoff ipucu). */
  retryAfterSeconds: number | null;
};

export function getDbCircuitState(nowMs: number = Date.now()): DbCircuitState {
  const open = isDbCircuitOpen(nowMs);
  return {
    open,
    consecutiveFailures,
    retryAfterSeconds: open ? Math.max(1, Math.ceil((openUntilMs - nowMs) / 1000)) : null,
  };
}

/** Yalnız test izolasyonu için. */
export function __resetDbCircuitForTests(): void {
  consecutiveFailures = 0;
  openUntilMs = 0;
  openStreak = 0;
}
