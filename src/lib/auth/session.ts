/**
 * Tek-operatör session imzalama (ADR-013/017 → ADR-049: Vercel OIDC geçişi).
 *
 * SESSION_SECRET: session cookie'sinin HMAC-SHA256 anahtarı. "Sign in with Vercel"
 * (OIDC) callback'i kimliği doğrulayıp allow-list'i geçtikten sonra bu imzalı
 * session cookie'si verilir; proxy her istekte `verifySession` ile doğrular.
 * Parola tabanlı kimlik (scrypt) ADR-049 ile emekli edildi — kimlik artık Vercel
 * OIDC'den gelir, session katmanı (HMAC) burada korunur. Secret DEĞERLERİ asla
 * loglanmaz.
 *
 * Saf/senkron (node:crypto). Proxy (Node.js runtime, Next 16) ve route
 * handler'larından çağrılır.
 */
import { timingSafeEqual, createHmac } from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Session token'ı imzala: `<expiryMs>.<hmacB64url>`. expiry MUTLAK ms (test
 * edilebilir olması için parametre — saat yan etkisi çağırana bırakılır).
 */
export function signSession(expiryMs: number, secret: string): string {
  const payload = String(expiryMs);
  const mac = createHmac("sha256", secret).update(payload).digest();
  return `${payload}.${b64url(mac)}`;
}

/** Yeni session token'ı üret (callback route'unda; şimdi + TTL). */
export function issueSession(secret: string, ttlMs: number = SESSION_TTL_MS): string {
  return signSession(Date.now() + ttlMs, secret);
}

export type SessionCheck = { valid: boolean; reason?: "malformed" | "bad_sig" | "expired" };

/** Token'ı doğrula: HMAC sabit-zamanlı eşleşmeli + expiry gelecekte olmalı. */
export function verifySession(
  token: string | undefined,
  secret: string | undefined,
  nowMs: number = Date.now(),
): SessionCheck {
  if (!token || !secret) return { valid: false, reason: "malformed" };
  const dot = token.indexOf(".");
  if (dot <= 0) return { valid: false, reason: "malformed" };
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiryMs = Number(payload);
  if (!Number.isFinite(expiryMs)) return { valid: false, reason: "malformed" };

  const expected = createHmac("sha256", secret).update(payload).digest();
  let provided: Buffer;
  try {
    provided = fromB64url(sig);
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (provided.length !== expected.length) return { valid: false, reason: "bad_sig" };
  if (!timingSafeEqual(provided, expected)) return { valid: false, reason: "bad_sig" };
  if (expiryMs <= nowMs) return { valid: false, reason: "expired" };
  return { valid: true };
}

export const SESSION_COOKIE = "cemos_session";
export const SESSION_TTL = SESSION_TTL_MS;
