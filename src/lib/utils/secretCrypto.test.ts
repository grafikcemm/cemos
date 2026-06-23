import { describe, it, expect, afterEach, vi } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted } from "./secretCrypto";

// 32 zero-bytes, base64 — valid AES-256 key for tests only.
const TEST_KEY = Buffer.alloc(32).toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("secretCrypto", () => {
  it("round-trips a secret (encrypt → decrypt)", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const plain = "EAAB-meta-access-token-123";
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces different ciphertext each time (random IV)", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("passes legacy plaintext through unchanged (no v1: prefix)", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    expect(decryptSecret("legacy-plaintext-token")).toBe("legacy-plaintext-token");
    expect(isEncrypted("legacy-plaintext-token")).toBe(false);
  });

  it("decrypts legacy plaintext even without a key", () => {
    // no CREDENTIAL_ENC_KEY stubbed
    expect(decryptSecret("plain")).toBe("plain");
  });

  it("throws when key missing and encryption requested", () => {
    expect(() => encryptSecret("x")).toThrow(/CREDENTIAL_ENC_KEY/);
  });

  it("rejects a wrong-length key", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", Buffer.alloc(16).toString("base64"));
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});
