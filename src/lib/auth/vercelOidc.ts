/**
 * "Sign in with Vercel" (OIDC) yardımcıları — tek-operatör erişim kapısının
 * kimlik katmanı (ADR-049). Parola yerine Vercel IdP; kimlik doğrulandıktan ve
 * allow-list geçildikten sonra `session.ts` HMAC cookie'si verilir.
 *
 * Tasarım kararları:
 *  - offline_access YOK, refresh token saklanmaz: kimliği bir kez doğrularız,
 *    sonra KENDİ session cookie'mizi veririz (Vercel token'ları cookie/log'a
 *    asla yazılmaz → daha küçük saldırı yüzeyi).
 *  - Allow-list FAIL-CLOSED: boş liste → herkes reddedilir.
 *  - Ağ fonksiyonları `fetchImpl` alır → hermetik test.
 *  - Provider hata gövdeleri sızdırılmaz (yalnız status kodu).
 */
import { createHash, randomBytes } from "node:crypto";

export const VERCEL_AUTHORIZE_URL = "https://vercel.com/oauth/authorize";
export const VERCEL_TOKEN_URL = "https://api.vercel.com/login/oauth/token";
export const VERCEL_USERINFO_URL = "https://api.vercel.com/login/oauth/userinfo";
export const OAUTH_SCOPE = "openid email profile";

/** Giriş kapısı hata kodları — üretici (callback) ↔ tüketici (/giris) sözleşmesi. */
export type AuthErrorCode = "config" | "denied" | "state" | "nonce" | "forbidden" | "oauth";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/** URL-safe rastgele string (state/nonce için). */
export function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CHARSET[bytes[i] % CHARSET.length];
  return out;
}

/** PKCE S256 challenge (verifier → base64url(sha256)). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Yeni PKCE çifti: hex verifier (86 karakter) + S256 challenge. */
export function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(43).toString("hex");
  return { verifier, challenge: pkceChallenge(verifier) };
}

/** Vercel authorize URL'ini kur. */
export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  scope?: string;
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    response_type: "code",
    scope: params.scope ?? OAUTH_SCOPE,
  });
  return `${VERCEL_AUTHORIZE_URL}?${q.toString()}`;
}

/**
 * Login sonrası redirect hedefinin güvenli, aynı-origin göreli yol olduğunu
 * doğrula (open-redirect koruması). Aksi durumda "/" döner.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.includes("\\")) return "/";
  for (let i = 0; i < next.length; i++) {
    const c = next.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return "/"; // kontrol karakterleri reddedilir
  }
  return next;
}

export interface VercelUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  picture?: string;
}

/** Allow-list env'ini normalize et (küçük harf, virgül/boşluk ayrık). */
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Allow-list kararı. FAIL-CLOSED: boş liste → herkes reddedilir.
 * Küçük-harf duyarsız eşleşme: doğrulanmış email VEYA preferred_username VEYA sub.
 */
export function isAllowedIdentity(user: VercelUserInfo, allowRaw: string | undefined): boolean {
  const allow = parseAllowlist(allowRaw);
  if (allow.length === 0) return false; // fail-closed
  const candidates: string[] = [];
  if (user.email && user.email_verified) candidates.push(user.email.toLowerCase());
  if (user.preferred_username) candidates.push(user.preferred_username.toLowerCase());
  if (user.sub) candidates.push(user.sub.toLowerCase());
  return candidates.some((c) => allow.includes(c));
}

/**
 * ID Token'ın `nonce` claim'ini imza DOĞRULAMADAN oku (yalnız replay kontrolü;
 * kimlik userinfo'dan gelir). Base64url payload → JSON.
 */
export function decodeIdTokenNonce(idToken: string): string | null {
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf-8");
    const obj = JSON.parse(json) as { nonce?: unknown };
    return typeof obj.nonce === "string" ? obj.nonce : null;
  } catch {
    return null;
  }
}

export interface VercelTokenResponse {
  access_token: string;
  token_type: string;
  id_token: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

type FetchLike = typeof fetch;

/** Authorization code → token (ağ). Hata gövdesi sızdırılmaz. */
export async function exchangeCodeForTokens(args: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: FetchLike;
}): Promise<VercelTokenResponse> {
  const f = args.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    code_verifier: args.codeVerifier,
    redirect_uri: args.redirectUri,
  });
  const res = await f(VERCEL_TOKEN_URL, { method: "POST", body });
  if (!res.ok) throw new Error(`token_exchange_failed_${res.status}`);
  return (await res.json()) as VercelTokenResponse;
}

/** Access token ile userinfo (ağ). */
export async function fetchUserInfo(accessToken: string, fetchImpl?: FetchLike): Promise<VercelUserInfo> {
  const f = fetchImpl ?? fetch;
  const res = await f(VERCEL_USERINFO_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo_failed_${res.status}`);
  return (await res.json()) as VercelUserInfo;
}
