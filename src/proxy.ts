import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { isLocalDevRuntime } from "@/lib/utils/cronAuth";

/**
 * Tek-operatör erişim kapısı (Next 16 Proxy; ADR-013/017). Node.js runtime
 * (varsayılan) → node:crypto session.ts içinde çalışır.
 *
 * - Allow-list: /giris, /api/auth/*, /api/cron/* (zaten CRON_SECRET korumalı),
 *   statikler (matcher ile hariç).
 * - Sır (ACCESS_PASSWORD_HASH/SESSION_SECRET) yoksa: yalnız pozitif-tanımlı yerel
 *   dev/test runtime → geç; aksi (prod VEYA NODE_ENV tanımsız) → fail-closed.
 * - Geçerli session cookie → geç; yoksa sayfa→/giris redirect, /api/*→401 JSON.
 *
 * Not: same-origin guard AYRI bir CSRF katmanıdır, authentication DEĞİL.
 */

function isAllowlisted(pathname: string): boolean {
  return (
    pathname === "/giris" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/cron/")
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isAllowlisted(pathname)) return NextResponse.next();

  const passwordHash = process.env.ACCESS_PASSWORD_HASH;
  const secret = process.env.SESSION_SECRET;
  const isApi = pathname.startsWith("/api/");

  // Yapılandırma eksik (erişim sırları yok).
  if (!passwordHash || !secret) {
    // Fail CLOSED by default. Only a positively-identified local dev/test runtime
    // gets the open setup pass-through — a custom Node server / Docker / PM2 with
    // NODE_ENV unset must NOT open the whole app just because it is not detected
    // as prod (auth-perimeter hardening).
    if (isLocalDevRuntime()) return NextResponse.next();
    // fail-closed: her şey giriş kurulum ekranına
    if (isApi) {
      return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.search = "?setup=1";
    return NextResponse.rewrite(url);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (verifySession(token, secret).valid) return NextResponse.next();

  // Kimliksiz.
  if (isApi) {
    return NextResponse.json({ ok: false, code: "unauthenticated" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/giris";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Statik varlıklar hariç HER yol (API dahil — allow-list proxy içinde).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
