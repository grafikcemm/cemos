import { describe, it, expect } from "vitest";
import { signSession, verifySession, issueSession } from "./session";

describe("session sign/verify (HMAC)", () => {
  const secret = "test-session-secret";
  const future = 10_000_000_000_000; // uzak gelecek
  const past = 1_000; // uzak geçmiş

  it("round-trips a valid unexpired token", () => {
    const tok = signSession(future, secret);
    expect(verifySession(tok, secret, future - 1).valid).toBe(true);
  });

  it("rejects an expired token", () => {
    const tok = signSession(past, secret);
    const r = verifySession(tok, secret, past + 1);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("rejects a token signed with a different secret", () => {
    const tok = signSession(future, "other-secret");
    const r = verifySession(tok, secret, 0);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad_sig");
  });

  it("rejects a tampered payload (expiry bump)", () => {
    const tok = signSession(past, secret);
    const tampered = `${future}.${tok.split(".")[1]}`;
    const r = verifySession(tampered, secret, 0);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad_sig");
  });

  it("rejects malformed tokens and missing secret", () => {
    expect(verifySession(undefined, secret).valid).toBe(false);
    expect(verifySession("no-dot", secret).valid).toBe(false);
    expect(verifySession(".abc", secret).valid).toBe(false);
    expect(verifySession(signSession(future, secret), undefined).valid).toBe(false);
  });

  it("issueSession yields a token valid now", () => {
    const tok = issueSession(secret, 60_000);
    expect(verifySession(tok, secret).valid).toBe(true);
  });
});
