/**
 * Tek-operatör erişim kapısı — parola + session imzalama (ADR-013/017).
 *
 * İki AYRI sır (kullanıcı sertleştirme kararı):
 *  - ACCESS_PASSWORD_HASH: operatör parolasının scrypt hash'i (düz parola env'de
 *    tutulmaz). `hashPassword` üretir, `verifyPassword` sabit-zamanlı doğrular.
 *  - SESSION_SECRET: session cookie'sinin HMAC-SHA256 anahtarı. Parola sırrından
 *    ayrıdır → biri sızsa diğeri korunur.
 *
 * Saf/senkron (node:crypto). Proxy (Node.js runtime, Next 16) ve route
 * handler'lardan çağrılır. Secret DEĞERLERİ asla loglanmaz.
 */
import {
  scryptSync,
  randomBytes,
  timingSafeEqual,
  createHmac,
} from "node:crypto";

const SCRYPT_KEYLEN = 32;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

/** Parolayı scrypt ile hash'le → `scrypt$<saltHex>$<hashHex>` (env'e yazılır). */
export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Parolayı saklanan hash'e karşı sabit-zamanlı doğrula. */
export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  // her ikisi de SCRYPT_KEYLEN uzunlukta → timingSafeEqual güvenli
  return timingSafeEqual(actual, expected);
}

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

/** Yeni session token'ı üret (login route'unda; şimdi + TTL). */
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
