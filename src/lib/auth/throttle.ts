/**
 * Erişim kapısı brute-force throttle (ADR-013/017 güvenlik sözleşmesi).
 *
 * - Ham IP SAKLANMAZ: ipKey = HMAC-SHA256(ip, SESSION_SECRET) (kısaltılmış hex).
 * - İstemci IP yalnız güvenilir Vercel forwarding zincirinden (`x-forwarded-for`
 *   ilk hop / `x-real-ip`) alınır.
 * - Atomik artış (upsert increment); pencere + kilit; başarıda sıfırlama.
 * - IP-bazlı sınıra EK global saldırı penceresi ("__global__" satırı).
 * - Fail-open: AuthAttempt tablosu push edilmemişse (P2021) veya DB hatasında
 *   throttle "izin ver"e düşer (birincil kapı parola hash'i; login ayrıca sabit
 *   gecikmeyle yavaşlatır). Tablo push edilince tam koruma devreye girer.
 */
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db/client";

const WINDOW_MS = 15 * 60 * 1000; // 15 dk pencere
const MAX_FAILS_PER_IP = 5;
const GLOBAL_MAX_FAILS = 30;
const LOCK_MS = 15 * 60 * 1000; // kilit süresi
const GLOBAL_KEY = "__global__";

export function ipKeyFor(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}

/** Güvenilir forwarding zincirinden istemci IP'si (yoksa "unknown"). */
export function clientIpFrom(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export type ThrottleState = { blocked: boolean; retryAfterMs: number };

async function readLock(ipKey: string, now: number): Promise<number> {
  const row = await prisma.authAttempt.findUnique({ where: { ipKey } });
  if (row?.lockedUntil && row.lockedUntil.getTime() > now) {
    return row.lockedUntil.getTime() - now;
  }
  return 0;
}

/** Login denemesinden ÖNCE: bu IP ya da global kilitli mi? Fail-open. */
export async function checkThrottle(ip: string, secret: string): Promise<ThrottleState> {
  const now = Date.now();
  try {
    const [ipMs, globalMs] = await Promise.all([
      readLock(ipKeyFor(ip, secret), now),
      readLock(GLOBAL_KEY, now),
    ]);
    const retryAfterMs = Math.max(ipMs, globalMs);
    return { blocked: retryAfterMs > 0, retryAfterMs };
  } catch {
    // tablo yok / DB hatası → fail-open (birincil kapı parola)
    return { blocked: false, retryAfterMs: 0 };
  }
}

async function bumpFailure(ipKey: string, max: number, now: number): Promise<void> {
  // atomik artış; pencere staleyse sıfırla
  const row = await prisma.authAttempt.upsert({
    where: { ipKey },
    create: { ipKey, failCount: 1, windowStart: new Date(now) },
    update: { failCount: { increment: 1 } },
  });
  const windowStale = now - row.windowStart.getTime() > WINDOW_MS;
  if (windowStale) {
    await prisma.authAttempt.update({
      where: { ipKey },
      data: { failCount: 1, windowStart: new Date(now), lockedUntil: null },
    });
    return;
  }
  if (row.failCount >= max) {
    await prisma.authAttempt.update({
      where: { ipKey },
      data: { lockedUntil: new Date(now + LOCK_MS) },
    });
  }
}

/** Başarısız login → per-IP + global sayaç artır. Fail-open. */
export async function recordFailure(ip: string, secret: string): Promise<void> {
  const now = Date.now();
  try {
    await bumpFailure(ipKeyFor(ip, secret), MAX_FAILS_PER_IP, now);
    await bumpFailure(GLOBAL_KEY, GLOBAL_MAX_FAILS, now);
  } catch {
    /* fail-open */
  }
}

/** Başarılı login → bu IP'nin sayacını sıfırla (global dokunulmaz). Fail-open. */
export async function recordSuccess(ip: string, secret: string): Promise<void> {
  try {
    await prisma.authAttempt.deleteMany({ where: { ipKey: ipKeyFor(ip, secret) } });
  } catch {
    /* fail-open */
  }
}
