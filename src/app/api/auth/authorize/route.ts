import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { makePkce, randomString, buildAuthorizeUrl, safeNextPath } from "@/lib/auth/vercelOidc";
import { isProductionRuntime } from "@/lib/utils/cronAuth";

const OAUTH_COOKIE_MAX_AGE = 10 * 60; // 10 dk

/**
 * "Sign in with Vercel" başlangıcı (ADR-049). PKCE + state + nonce üretir,
 * kısa-ömürlü httpOnly cookie'lere yazar ve Vercel authorize endpoint'ine
 * yönlendirir. Client id yoksa → /giris?e=config (fail-closed).
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID;
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!clientId) {
    const url = new URL("/giris", request.url);
    url.searchParams.set("e", "config");
    return NextResponse.redirect(url);
  }

  const state = randomString(43);
  const nonce = randomString(43);
  const { verifier, challenge } = makePkce();

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri: `${request.nextUrl.origin}/api/auth/callback`,
    state,
    nonce,
    codeChallenge: challenge,
  });

  const res = NextResponse.redirect(authorizeUrl);
  const opts = {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
  res.cookies.set("oauth_state", state, opts);
  res.cookies.set("oauth_nonce", nonce, opts);
  res.cookies.set("oauth_code_verifier", verifier, opts);
  res.cookies.set("oauth_next", next, opts);
  return res;
}
