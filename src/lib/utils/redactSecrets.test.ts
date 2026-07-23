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

  it("masks Google API keys (Gemini transcript / YouTube Data API)", () => {
    const out = redactSecrets(
      "fetch failed https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q",
    );
    expect(out).not.toContain("AIzaSy");
    expect(out).toContain("[REDACTED");
  });

  it("masks credentials carried as URL query params (Meta access_token, generic token)", () => {
    expect(redactSecrets("Graph error ?access_token=EAABsecretMetaToken123")).not.toContain(
      "EAABsecretMetaToken123",
    );
    expect(redactSecrets("url?fb_exchange_token=abc123def456ghi&x=1")).not.toContain(
      "abc123def456ghi",
    );
    expect(redactSecrets("https://x.test/cb?token=supersecretvalue&page=2")).toContain(
      "token=[REDACTED]",
    );
  });

  it("masks bare Meta long-lived Graph tokens (EAA…)", () => {
    const out = redactSecrets("igClient: token=EAABwzLixnjYBO1a2b3c4d5e6f7g8h9i0 rejected");
    expect(out).not.toContain("EAABwzLixnjYBO1a2b3c4d5e6f7g8h9i0");
    expect(out).toContain("[REDACTED_KEY]");
  });

  it("masks credentials in non-DB URL userinfo (https://user:pass@host)", () => {
    const out = redactSecrets("redirect to https://admin:s3cretPw@internal.example.com/x");
    expect(out).not.toContain("admin:s3cretPw");
    expect(out).toContain("https://[REDACTED]@internal.example.com");
  });

  it("masks the OS username in local filesystem paths (Windows + Unix)", () => {
    const win = redactSecrets("ENOENT: open 'C:\\Users\\alice\\.env.local'");
    expect(win).not.toContain("alice");
    expect(win).toContain("C:\\Users\\[REDACTED]");
    const nix = redactSecrets("cannot read /home/deploy/secrets/key");
    expect(nix).not.toContain("/home/deploy");
    expect(nix).toContain("/home/[REDACTED]");
  });

  it("masks BARE Prisma connection-error hosts (SEC-M1, live-proven shape)", () => {
    const p1001 = redactSecrets(
      "Can't reach database server at `ep-long-sun-aph0vvvg-pooler.c-7.us-east-1.aws.neon.tech:5432`",
    );
    expect(p1001).not.toContain("neon.tech");
    expect(p1001).toContain("[REDACTED_HOST]");
    const running = redactSecrets(
      "Please make sure your database server is running at `ep-x.aws.neon.tech:5432`.",
    );
    expect(running).not.toContain("neon.tech");
    const p1000 = redactSecrets(
      "Authentication failed against database server, the provided database credentials for `neondb_owner` are not valid.",
    );
    expect(p1000).not.toContain("neondb_owner");
  });

  it("masks generic backticked host:port fragments (defense-in-depth)", () => {
    const out = redactSecrets("dial `db.internal.example.com:6543` refused");
    expect(out).not.toContain("db.internal.example.com");
    expect(out).toContain("`[REDACTED_HOST]`");
  });

  it("leaves benign query params untouched", () => {
    const msg = "https://x.test/list?page=2&sort=desc&limit=50";
    expect(redactSecrets(msg)).toBe(msg);
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
