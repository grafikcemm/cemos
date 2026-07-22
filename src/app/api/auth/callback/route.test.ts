import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

const SECRET = "test-session-secret-xyz";

function idTokenWithNonce(nonce: string): string {
  const payload = Buffer.from(JSON.stringify({ nonce, sub: "s" })).toString("base64url");
  return `h.${payload}.s`;
}

function makeReq(query: string, cookies: Record<string, string>): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest(`https://cemos.example/api/auth/callback${query}`, { headers });
}

function stubFetch(user: Record<string, unknown>, nonce: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes("/login/oauth/token")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "at",
            id_token: idTokenWithNonce(nonce),
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid email profile",
          }),
        } as unknown as Response;
      }
      if (u.includes("/login/oauth/userinfo")) {
        return { ok: true, status: 200, json: async () => user } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
}

describe("callback route (Sign in with Vercel)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID = "cid";
    process.env.VERCEL_APP_CLIENT_SECRET = "secret";
    process.env.SESSION_SECRET = SECRET;
    process.env.AUTH_ALLOWED_VERCEL_USERS = "owner@example.com";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID;
    delete process.env.VERCEL_APP_CLIENT_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_ALLOWED_VERCEL_USERS;
  });

  it("mints a valid session for an allowed identity and honors safe next", async () => {
    stubFetch({ sub: "s", email: "owner@example.com", email_verified: true }, "nonce-1");
    const req = makeReq("?code=abc&state=st1", {
      oauth_state: "st1",
      oauth_nonce: "nonce-1",
      oauth_code_verifier: "ver",
      oauth_next: "/bugun",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toBe("https://cemos.example/bugun");
    const sess = res.cookies.get(SESSION_COOKIE);
    expect(sess?.value).toBeTruthy();
    expect(verifySession(sess?.value, SECRET).valid).toBe(true);
  });

  it("rejects a state mismatch without minting a session", async () => {
    stubFetch({ sub: "s", email: "owner@example.com", email_verified: true }, "nonce-1");
    const req = makeReq("?code=abc&state=WRONG", {
      oauth_state: "st1",
      oauth_nonce: "nonce-1",
      oauth_code_verifier: "ver",
      oauth_next: "/bugun",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("/giris");
    expect(res.headers.get("location")).toContain("e=state");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeFalsy();
  });

  it("denies an identity not on the allow-list (forbidden)", async () => {
    stubFetch({ sub: "s", email: "intruder@example.com", email_verified: true }, "nonce-1");
    const req = makeReq("?code=abc&state=st1", {
      oauth_state: "st1",
      oauth_nonce: "nonce-1",
      oauth_code_verifier: "ver",
      oauth_next: "/bugun",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("e=forbidden");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeFalsy();
  });

  it("rejects a nonce mismatch (replay guard)", async () => {
    stubFetch({ sub: "s", email: "owner@example.com", email_verified: true }, "DIFFERENT-nonce");
    const req = makeReq("?code=abc&state=st1", {
      oauth_state: "st1",
      oauth_nonce: "nonce-1",
      oauth_code_verifier: "ver",
      oauth_next: "/bugun",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("e=nonce");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeFalsy();
  });

  it("treats a Vercel error param as denied (user cancelled consent)", async () => {
    stubFetch({ sub: "s", email: "owner@example.com", email_verified: true }, "nonce-1");
    const req = makeReq("?error=access_denied&state=st1", {
      oauth_state: "st1",
      oauth_nonce: "nonce-1",
      oauth_code_verifier: "ver",
      oauth_next: "/bugun",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("e=denied");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeFalsy();
  });

  it("maps a token-exchange failure to e=oauth without leaking provider detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url).includes("/login/oauth/token")) {
          return { ok: false, status: 400, json: async () => ({ error: "leak-me" }) } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }),
    );
    const req = makeReq("?code=abc&state=st1", {
      oauth_state: "st1",
      oauth_nonce: "nonce-1",
      oauth_code_verifier: "ver",
      oauth_next: "/bugun",
    });
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("e=oauth");
    expect(loc).not.toContain("leak-me");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeFalsy();
  });

  it("loop-guards a next of /giris back to '/' (still mints session)", async () => {
    stubFetch({ sub: "s", email: "owner@example.com", email_verified: true }, "nonce-1");
    const req = makeReq("?code=abc&state=st1", {
      oauth_state: "st1",
      oauth_nonce: "nonce-1",
      oauth_code_verifier: "ver",
      oauth_next: "/giris",
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toBe("https://cemos.example/");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });

  it("redirects config error when secrets are missing", async () => {
    delete process.env.SESSION_SECRET;
    const req = makeReq("?code=abc&state=st1", { oauth_state: "st1" });
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("e=config");
  });
});
