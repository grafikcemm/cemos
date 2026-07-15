import { NextResponse } from "next/server";
import { verifyPassword, issueSession, SESSION_COOKIE, SESSION_TTL } from "@/lib/auth/session";
import {
  checkThrottle,
  recordFailure,
  recordSuccess,
  clientIpFrom,
} from "@/lib/auth/throttle";

export const runtime = "nodejs";

const FAIL_DELAY_MS = 500; // brute-force damping (throttle tablosundan bağımsız)

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** next parametresini güvene al: yalnız site-içi mutlak yol (open-redirect yok). */
function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL / 1000),
  });
}

export async function POST(req: Request) {
  // İki mod: (a) native form POST → 303 redirect (JS'siz, Fast-Refresh-güvenli,
  // prod-doğru); (b) JSON POST → JSON yanıt (programatik / E2E globalSetup).
  const ct = req.headers.get("content-type") || "";
  const isForm = ct.includes("form-urlencoded") || ct.includes("form-data");

  let password = "";
  let next = "/";
  if (isForm) {
    const form = await req.formData().catch(() => null);
    if (form) {
      password = String(form.get("password") ?? "");
      next = safeNext(String(form.get("next") ?? "/"));
    }
  } else {
    try {
      const body = (await req.json()) as { password?: unknown; next?: unknown };
      if (typeof body?.password === "string") password = body.password;
      if (typeof body?.next === "string") next = safeNext(body.next);
    } catch {
      /* boş → yanlış parola gibi */
    }
  }

  const fail = (code: string, status: number, extra?: Record<string, unknown>) =>
    isForm
      ? NextResponse.redirect(new URL(`/giris?e=${code}`, req.url), 303)
      : NextResponse.json({ ok: false, code, ...extra }, { status });

  const passwordHash = process.env.ACCESS_PASSWORD_HASH;
  const secret = process.env.SESSION_SECRET;

  if (!passwordHash || !secret) {
    const prod = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
    if (isForm) return NextResponse.redirect(new URL("/giris?e=setup", req.url), 303);
    return NextResponse.json(
      { ok: false, code: prod ? "not_configured" : "dev_open" },
      { status: prod ? 503 : 200 },
    );
  }

  const ip = clientIpFrom(req.headers);

  const throttle = await checkThrottle(ip, secret);
  if (throttle.blocked) {
    return fail("rate_limited", 429, { retryAfterMs: throttle.retryAfterMs });
  }

  if (!verifyPassword(password, passwordHash)) {
    await recordFailure(ip, secret);
    await sleep(FAIL_DELAY_MS);
    return fail("invalid_password", 401);
  }

  await recordSuccess(ip, secret);
  const token = issueSession(secret);

  if (isForm) {
    const res = NextResponse.redirect(new URL(next, req.url), 303);
    setSessionCookie(res, token);
    return res;
  }
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token);
  return res;
}
