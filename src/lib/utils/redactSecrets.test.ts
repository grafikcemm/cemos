import { describe, it, expect } from "vitest";
import { redactSecrets, redactError } from "./redactSecrets";

describe("redactSecrets", () => {
  it("masks database connection strings", () => {
    const out = redactSecrets("connect failed: postgresql://user:pass@host:5432/db?sslmode=require");
    expect(out).toContain("postgresql://[REDACTED]");
    expect(out).not.toContain("pass@host");
  });

  it("masks provider API keys", () => {
    expect(redactSecrets("key sk-abcdef123456 leaked")).toContain("[REDACTED_KEY]");
    expect(redactSecrets("ghp_ABCDEFGH1234567890")).toContain("[REDACTED_KEY]");
    expect(redactSecrets("fal-KEYABCDEFGH")).toContain("[REDACTED_KEY]");
  });

  it("masks Bearer tokens", () => {
    expect(redactSecrets("Authorization: Bearer eyJhbGciOi.payload.sig")).toContain("Bearer [REDACTED]");
  });

  it("leaves ordinary user messages unchanged", () => {
    const msg = "Geçersiz profil değeri.";
    expect(redactSecrets(msg)).toBe(msg);
  });

  it("handles null/undefined safely", () => {
    expect(redactSecrets(undefined as unknown as string)).toBe("");
  });
});

describe("redactError", () => {
  it("reduces an Error to its redacted message (no stack/object)", () => {
    const err = new Error("DB down at postgres://u:p@h/db");
    const out = redactError(err);
    expect(out).toContain("postgres://[REDACTED]");
    expect(out).not.toContain("u:p@h");
    expect(out).not.toContain("Error:");
  });

  it("passes through a plain string, redacted", () => {
    expect(redactError("Bearer abcdefgh12345")).toContain("Bearer [REDACTED]");
  });

  it("stringifies a non-error value", () => {
    expect(redactError({ weird: true })).toBe("[object Object]");
  });
});
