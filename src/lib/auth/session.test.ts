import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  issueSession,
} from "./session";

describe("password hashing (scrypt)", () => {
  it("verifies the correct password", () => {
    const stored = hashPassword("dogru-parola");
    expect(verifyPassword("dogru-parola", stored)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const stored = hashPassword("dogru-parola");
    expect(verifyPassword("yanlis", stored)).toBe(false);
  });

  it("produces a different salt each call (non-deterministic hash)", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });

  it("is deterministic with an explicit salt (E2E fixture üretimi)", () => {
    const salt = "00112233445566778899aabbccddeeff";
    expect(hashPassword("x", salt)).toBe(hashPassword("x", salt));
  });

  it("rejects malformed / empty stored hash", () => {
    expect(verifyPassword("x", undefined)).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "plain")).toBe(false);
    expect(verifyPassword("x", "scrypt$deadbeef")).toBe(false);
  });
});

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
