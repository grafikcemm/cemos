import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { safeNextPath } from "@/lib/auth/vercelOidc";

function makeReq(query: string): NextRequest {
  return new NextRequest(`https://cemos.example/api/auth/authorize${query}`);
}

const OAUTH_COOKIES = ["oauth_state", "oauth_nonce", "oauth_code_verifier", "oauth_next"];

describe("authorize route (Sign in with Vercel)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID = "cid-123";
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID;
  });

  it("redirects to Vercel authorize (PKCE S256) and sets 4 httpOnly oauth cookies", async () => {
    const res = await GET(makeReq("?next=/bugun"));
    const loc = res.headers.get("location") ?? "";
    expect(loc.startsWith("https://vercel.com/oauth/authorize?")).toBe(true);

    const q = new URL(loc).searchParams;
    expect(q.get("client_id")).toBe("cid-123");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("code_challenge")).toBeTruthy();
    expect(q.get("scope")).toBe("openid email profile");
    expect(q.get("redirect_uri")).toBe("https://cemos.example/api/auth/callback");

    for (const name of OAUTH_COOKIES) {
      const c = res.cookies.get(name);
      expect(c?.value).toBeTruthy();
      expect(c?.httpOnly).toBe(true);
      expect(c?.sameSite).toBe("lax");
      expect(c?.path).toBe("/");
      expect(c?.maxAge).toBe(600);
    }
    // state/nonce cookies must equal the values embedded in the authorize URL.
    expect(res.cookies.get("oauth_state")?.value).toBe(q.get("state"));
    expect(res.cookies.get("oauth_nonce")?.value).toBe(q.get("nonce"));
    expect(res.cookies.get("oauth_next")?.value).toBe("/bugun");
  });

  it("sanitizes an unsafe next into '/' (open-redirect guard)", async () => {
    const res = await GET(makeReq("?next=//evil.com"));
    expect(res.cookies.get("oauth_next")?.value).toBe(safeNextPath("//evil.com"));
    expect(res.cookies.get("oauth_next")?.value).toBe("/");
  });

  it("fail-closes to /giris?e=config when client id is missing (no oauth cookies)", async () => {
    delete process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID;
    const res = await GET(makeReq("?next=/x"));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/giris");
    expect(loc).toContain("e=config");
    expect(res.cookies.get("oauth_state")?.value).toBeFalsy();
  });
});
