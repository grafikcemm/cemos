import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  randomString,
  pkceChallenge,
  makePkce,
  buildAuthorizeUrl,
  safeNextPath,
  parseAllowlist,
  isAllowedIdentity,
  decodeIdTokenNonce,
  exchangeCodeForTokens,
  fetchUserInfo,
  VERCEL_AUTHORIZE_URL,
  type VercelUserInfo,
} from "./vercelOidc";

describe("randomString (state/nonce generator)", () => {
  it("returns the requested length from the URL-safe charset", () => {
    const s = randomString(43);
    expect(s.length).toBe(43);
    expect(/^[A-Za-z0-9\-._~]+$/.test(s)).toBe(true);
  });
  it("produces different values across calls", () => {
    expect(randomString(43)).not.toBe(randomString(43));
  });
});

describe("PKCE", () => {
  it("pkceChallenge equals base64url(sha256(verifier))", () => {
    const verifier = "abc123";
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(pkceChallenge(verifier)).toBe(expected);
  });

  it("makePkce produces a verifier whose challenge matches", () => {
    const { verifier, challenge } = makePkce();
    expect(challenge).toBe(pkceChallenge(verifier));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("buildAuthorizeUrl", () => {
  it("includes all required PKCE/OIDC params", () => {
    const url = buildAuthorizeUrl({
      clientId: "cid",
      redirectUri: "https://app.example/api/auth/callback",
      state: "st",
      nonce: "no",
      codeChallenge: "ch",
    });
    expect(url.startsWith(`${VERCEL_AUTHORIZE_URL}?`)).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("client_id")).toBe("cid");
    expect(q.get("redirect_uri")).toBe("https://app.example/api/auth/callback");
    expect(q.get("state")).toBe("st");
    expect(q.get("nonce")).toBe("no");
    expect(q.get("code_challenge")).toBe("ch");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toBe("openid email profile");
  });
});

describe("safeNextPath (open-redirect guard)", () => {
  it("passes a normal relative path", () => {
    expect(safeNextPath("/bugun")).toBe("/bugun");
    expect(safeNextPath("/a/b?c=1&d=2")).toBe("/a/b?c=1&d=2");
  });
  it("rejects protocol-relative, absolute, backslash, and control chars", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("/a\\b")).toBe("/");
    expect(safeNextPath("/a\nb")).toBe("/");
    expect(safeNextPath("evil")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });
});

describe("parseAllowlist", () => {
  it("splits on comma/space, lowercases, trims, drops empties", () => {
    expect(parseAllowlist("  Ali@Ex.com , kurodantez ")).toEqual(["ali@ex.com", "kurodantez"]);
    expect(parseAllowlist("a\nb  c")).toEqual(["a", "b", "c"]);
    expect(parseAllowlist("")).toEqual([]);
    expect(parseAllowlist(undefined)).toEqual([]);
  });
});

describe("isAllowedIdentity (fail-closed)", () => {
  const base: VercelUserInfo = {
    sub: "sub-123",
    email: "user@example.com",
    email_verified: true,
    preferred_username: "timmy",
  };

  it("denies everyone when allow-list is empty", () => {
    expect(isAllowedIdentity(base, undefined)).toBe(false);
    expect(isAllowedIdentity(base, "")).toBe(false);
    expect(isAllowedIdentity(base, "   ")).toBe(false);
  });
  it("allows a verified email match (case-insensitive)", () => {
    expect(isAllowedIdentity(base, "USER@example.com")).toBe(true);
  });
  it("does NOT match an unverified email", () => {
    expect(isAllowedIdentity({ ...base, email_verified: false }, "user@example.com")).toBe(false);
  });
  it("allows a preferred_username match", () => {
    expect(isAllowedIdentity({ sub: "x", preferred_username: "Timmy" }, "timmy")).toBe(true);
  });
  it("allows a sub match", () => {
    expect(isAllowedIdentity({ sub: "SUB-XYZ" }, "sub-xyz")).toBe(true);
  });
  it("denies when nothing matches", () => {
    expect(isAllowedIdentity(base, "someone-else@example.com")).toBe(false);
  });
});

describe("decodeIdTokenNonce", () => {
  it("extracts the nonce claim", () => {
    const payload = Buffer.from(JSON.stringify({ nonce: "nonce-abc", sub: "x" })).toString("base64url");
    const jwt = `header.${payload}.sig`;
    expect(decodeIdTokenNonce(jwt)).toBe("nonce-abc");
  });
  it("returns null for malformed token or missing nonce", () => {
    expect(decodeIdTokenNonce("notajwt")).toBe(null);
    const noNonce = Buffer.from(JSON.stringify({ sub: "x" })).toString("base64url");
    expect(decodeIdTokenNonce(`h.${noNonce}.s`)).toBe(null);
    expect(decodeIdTokenNonce("h.%%%.s")).toBe(null);
  });
});

describe("exchangeCodeForTokens / fetchUserInfo (injected fetch)", () => {
  const okJson = (data: unknown): Response =>
    ({ ok: true, status: 200, json: async () => data }) as unknown as Response;
  const errStatus = (status: number): Response =>
    ({ ok: false, status, json: async () => ({ error: "leak-me" }) }) as unknown as Response;

  it("returns token json on success", async () => {
    const out = await exchangeCodeForTokens({
      code: "c",
      codeVerifier: "v",
      redirectUri: "https://a/api/auth/callback",
      clientId: "cid",
      clientSecret: "sec",
      fetchImpl: async () =>
        okJson({ access_token: "at", id_token: "it", token_type: "Bearer", expires_in: 3600, scope: "openid" }),
    });
    expect(out.access_token).toBe("at");
  });
  it("throws a status-only error (no provider body leak) on failure", async () => {
    await expect(
      exchangeCodeForTokens({
        code: "c",
        codeVerifier: "v",
        redirectUri: "r",
        clientId: "cid",
        clientSecret: "sec",
        fetchImpl: async () => errStatus(400),
      }),
    ).rejects.toThrow("token_exchange_failed_400");
  });
  it("fetchUserInfo returns claims and sends Bearer auth", async () => {
    let seenAuth = "";
    const user = await fetchUserInfo("access-tok", (async (_url: string, init?: RequestInit) => {
      seenAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return okJson({ sub: "s", email: "e@x.com", email_verified: true });
    }) as unknown as typeof fetch);
    expect(user.sub).toBe("s");
    expect(seenAuth).toBe("Bearer access-tok");
  });
  it("fetchUserInfo throws status-only on failure", async () => {
    await expect(
      fetchUserInfo("t", (async () => errStatus(401)) as unknown as typeof fetch),
    ).rejects.toThrow("userinfo_failed_401");
  });
});
