import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  decodeIdTokenNonce,
  isAllowedIdentity,
  safeNextPath,
  type AuthErrorCode,
} from "@/lib/auth/vercelOidc";
import { issueSession, SESSION_COOKIE, SESSION_TTL } from "@/lib/auth/session";
import { isProductionRuntime, timingSafeEqualStr } from "@/lib/utils/cronAuth";
import { redactError } from "@/lib/utils/redactSecrets";

const OAUTH_COOKIES = ["oauth_state", "oauth_nonce", "oauth_code_verifier", "oauth_next"] as const;

function clearOauthCookies(res: NextResponse): void {
  for (const name of OAUTH_COOKIES) res.cookies.set(name, "", { path: "/", maxAge: 0 });
}

function fail(request: NextRequest, code: AuthErrorCode): NextResponse {
  const url = new URL("/giris", request.url);
  url.searchParams.set("e", code);
  const res = NextResponse.redirect(url);
  clearOauthCookies(res);
  return res;
}

/**
 * "Sign in with Vercel" callback (ADR-049). state (CSRF) + nonce (replay) + PKCE
 * doğrular, kimliği userinfo'dan alır, allow-list'i (FAIL-CLOSED) uygular ve
 * yalnız BAŞARILIYSA kendi cemos_session HMAC cookie'sini verir. Vercel
 * token'ları hiçbir yere yazılmaz. Hata detayı istemciye sızdırılmaz (yalnız
 * kısa kod); sunucuya redakte edilmiş tek satır loglanır (kör hata olmaz).
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID;
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret) return fail(request, "config");

  const sp = request.nextUrl.searchParams;
  if (sp.get("error")) return fail(request, "denied"); // kullanıcı reddetti / IdP hatası

  const code = sp.get("code");
  const state = sp.get("state");
  const storedState = request.cookies.get("oauth_state")?.value;
  const storedNonce = request.cookies.get("oauth_nonce")?.value;
  const codeVerifier = request.cookies.get("oauth_code_verifier")?.value;
  const rawNext = request.cookies.get("oauth_next")?.value;

  if (!code || !state || !storedState || !timingSafeEqualStr(state, storedState) || !codeVerifier) {
    return fail(request, "state");
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier,
      redirectUri: `${request.nextUrl.origin}/api/auth/callback`,
      clientId,
      clientSecret,
    });

    const nonce = decodeIdTokenNonce(tokens.id_token);
    if (!nonce || !storedNonce || !timingSafeEqualStr(nonce, storedNonce)) return fail(request, "nonce");

    const user = await fetchUserInfo(tokens.access_token);
    if (!isAllowedIdentity(user, process.env.AUTH_ALLOWED_VERCEL_USERS)) {
      return fail(request, "forbidden");
    }

    // Loop koruması: sign-in/API yollarına geri gönderme.
    const nextPath = safeNextPath(rawNext);
    const dest = nextPath.startsWith("/giris") || nextPath.startsWith("/api/") ? "/" : nextPath;

    const token = issueSession(sessionSecret, SESSION_TTL);
    const res = NextResponse.redirect(new URL(dest, request.url));
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProductionRuntime(),
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL / 1000),
    });
    clearOauthCookies(res);
    return res;
  } catch (err) {
    // Provider detayı istemciye sızmaz; sunucuya redakte edilmiş tek satır loglanır.
    console.error("[auth/callback]", redactError(err));
    return fail(request, "oauth");
  }
}
