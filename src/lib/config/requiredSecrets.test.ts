import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assertRequiredSecrets, findMissingSecrets } from "./requiredSecrets";

const ALL_KEYS = ["DATABASE_URL", "OPENROUTER_API_KEY", "CRON_SECRET", "CREDENTIAL_ENC_KEY"];

describe("startup secret assertion (FIRST-SPRINT item 18)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of ALL_KEYS) delete process.env[key];
    delete process.env.VERCEL;
    vi.stubEnv("NODE_ENV", "test");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("DATABASE_URL eksikse her ortamda fatal", () => {
    expect(() => assertRequiredSecrets()).toThrow(/DATABASE_URL/);
  });

  it("hata mesajı yalnız İSİM içerir — secret DEĞERİ asla sızmaz", () => {
    process.env.DATABASE_URL = "";
    process.env.OPENROUTER_API_KEY = "sk-super-secret-value-123";
    try {
      assertRequiredSecrets();
      expect.unreachable("throw bekleniyordu");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain("sk-super-secret-value-123");
    }
  });

  it("dev'de production-only eksikler yalnız uyarı (isim bazlı), fatal değil", () => {
    process.env.DATABASE_URL = "postgres://test";
    const { fatal, warned } = findMissingSecrets();
    expect(fatal).toEqual([]);
    expect(warned).toEqual(["OPENROUTER_API_KEY", "CRON_SECRET", "CREDENTIAL_ENC_KEY"]);
    expect(() => assertRequiredSecrets()).not.toThrow();
  });

  it("production'da (VERCEL=1) production-only eksikler de fatal", () => {
    process.env.VERCEL = "1";
    process.env.DATABASE_URL = "postgres://test";
    const { fatal } = findMissingSecrets();
    expect(fatal).toContain("CRON_SECRET");
    expect(() => assertRequiredSecrets()).toThrow(/CRON_SECRET/);
  });

  it("hepsi tanımlıysa sessizce geçer", () => {
    process.env.VERCEL = "1";
    for (const key of ALL_KEYS) process.env[key] = "dolu";
    expect(() => assertRequiredSecrets()).not.toThrow();
  });

  it("boş string eksik sayılır", () => {
    process.env.DATABASE_URL = "   ";
    expect(() => assertRequiredSecrets()).toThrow(/DATABASE_URL/);
  });
});
