/**
 * SSRF guard'ı (Sprint 4 — FINAL-SECURITY-SPEC §6, OWASP).
 *
 * Her dış fetch ÖNCESİ:
 *  1. Şema allowlist: yalnız http/https (file:, gopher: vs. reddedilir).
 *  2. DNS resolve → final IP private/loopback/link-local/metadata aralığında
 *     ise fetch ÖNCESİ reddet (127/8, 10/8, 172.16/12, 192.168/16,
 *     169.254/16 [metadata dahil], 0/8, ::1, fc00::/7, fe80::/10, mapped v4).
 *  3. Redirect hop'ları OTOMATİK TAKİP EDİLMEZ — her hop aynı guard'dan geçer
 *     (çağıran sorumluluğu: verifyWebsite manuel çözümler).
 */

import { lookup } from "node:dns/promises";

export class SsrfBlockedError extends Error {
  constructor(reason: string, target: string) {
    super(`SSRF koruması: ${reason} (${target})`);
    this.name = "SsrfBlockedError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** IPv4 string → 32-bit sayı; geçersizse null. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255 || (p.length > 1 && p.startsWith("0"))) return null;
    out = out * 256 + n;
  }
  return out >>> 0;
}

const V4_BLOCKED: Array<{ base: string; maskBits: number }> = [
  { base: "127.0.0.0", maskBits: 8 }, // loopback
  { base: "10.0.0.0", maskBits: 8 }, // private
  { base: "172.16.0.0", maskBits: 12 }, // private
  { base: "192.168.0.0", maskBits: 16 }, // private
  { base: "169.254.0.0", maskBits: 16 }, // link-local + cloud metadata (169.254.169.254)
  { base: "0.0.0.0", maskBits: 8 }, // "this" network
];

export function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return V4_BLOCKED.some(({ base, maskBits }) => {
    const b = ipv4ToInt(base)!;
    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    return (n & mask) === (b & mask);
  });
}

export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) → v4 kurallarına indirgenir.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb"))
    return true; // fe80::/10 link-local
  return false;
}

export function isPrivateIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
}

export type ResolveHost = (hostname: string) => Promise<string[]>;

/** Varsayılan resolver — tüm A/AAAA kayıtları (herhangi biri private ise red). */
export const defaultResolveHost: ResolveHost = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

/**
 * URL'i fetch ÖNCESİ doğrular; ihlalde SsrfBlockedError fırlatır.
 * Redirect zincirinde HER hop için yeniden çağrılmalıdır.
 */
export async function assertSafeUrl(
  rawUrl: string,
  resolveHost: ResolveHost = defaultResolveHost
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("geçersiz URL", rawUrl);
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfBlockedError(`şema yasak: ${url.protocol}`, rawUrl);
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError("URL'de kimlik bilgisi", rawUrl);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // IPv6 köşeli parantez
  // Literal IP host → doğrudan kontrol (DNS'e gerek yok).
  if (isPrivateIp(hostname)) {
    throw new SsrfBlockedError("private/metadata IP", hostname);
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":")) {
    return url; // literal public IP — resolve gereksiz
  }

  let ips: string[];
  try {
    ips = await resolveHost(hostname);
  } catch {
    throw new SsrfBlockedError("DNS çözülemedi", hostname);
  }
  if (ips.length === 0) throw new SsrfBlockedError("DNS kaydı yok", hostname);
  const bad = ips.find((ip) => isPrivateIp(ip));
  if (bad) throw new SsrfBlockedError(`private/metadata IP'ye çözüldü: ${bad}`, hostname);
  return url;
}
