import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { isProductionRuntime } from "@/lib/utils/cronAuth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
