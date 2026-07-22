import { describe, it, expect } from "vitest";
import {
  isEphemeralDbUrl,
  assertEphemeralDbUrl,
  resolveE2eDatabaseUrl,
  buildE2eServerEnv,
  leakedSecretKeys,
  dbUrlHost,
} from "./e2eEnv";

const NEON = "postgresql://u:p@ep-long-sun-aph0vvvg-pooler.c-7.us-east-1.aws.neon.tech:5432/neondb?sslmode=require";
const SUPABASE = "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres";
const VERCEL_PG = "postgres://default:pw@ep-cool-1234.us-east-1.postgres.vercel-storage.com:5432/verceldb";
const LOCAL = "postgresql://e2e:e2e@127.0.0.1:5432/cemos_e2e";
const LOCALHOST = "postgresql://e2e:e2e@localhost:5432/cemos_e2e";

describe("e2eEnv — DB URL ephemeral guard (Neon egress closure)", () => {
  it("localhost / 127.0.0.1 / ::1 EPHEMERAL; boş → ephemeral (dummy'e düşer)", () => {
    expect(isEphemeralDbUrl(LOCAL)).toBe(true);
    expect(isEphemeralDbUrl(LOCALHOST)).toBe(true);
    expect(isEphemeralDbUrl("postgresql://e2e@[::1]:5432/db")).toBe(true);
    expect(isEphemeralDbUrl("")).toBe(true);
    expect(isEphemeralDbUrl(undefined)).toBe(true);
  });

  it("Neon / Supabase / Vercel / uzak host EPHEMERAL DEĞİL (reddedilir)", () => {
    expect(isEphemeralDbUrl(NEON)).toBe(false);
    expect(isEphemeralDbUrl(SUPABASE)).toBe(false);
    expect(isEphemeralDbUrl(VERCEL_PG)).toBe(false);
    expect(dbUrlHost(NEON)).toContain("neon.tech");
  });

  it("assertEphemeralDbUrl: Neon URL FAIL-CLOSED throw eder (host mesajda, parola YOK)", () => {
    let msg = "";
    try {
      assertEphemeralDbUrl(NEON);
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toContain("FAIL-CLOSED");
    expect(msg).toContain("neon.tech");
    expect(msg).not.toContain(":p@"); // parola sızmaz
    // localhost geçer (throw yok)
    expect(() => assertEphemeralDbUrl(LOCAL)).not.toThrow();
  });

  it("resolveE2eDatabaseUrl: production Neon E2E_DATABASE_URL FAIL-CLOSED; boşsa dummy localhost", () => {
    expect(() => resolveE2eDatabaseUrl({ E2E_DATABASE_URL: NEON })).toThrow(/FAIL-CLOSED/);
    expect(resolveE2eDatabaseUrl({ E2E_DATABASE_URL: LOCAL })).toBe(LOCAL);
    expect(resolveE2eDatabaseUrl({})).toContain("127.0.0.1"); // dummy localhost
  });

  it("resolveE2eDatabaseUrl: process.env.DATABASE_URL (production) ASLA kullanılmaz", () => {
    // Yalnız E2E_DATABASE_URL onurlandırılır; DATABASE_URL yok sayılır → dummy.
    const url = resolveE2eDatabaseUrl({ DATABASE_URL: NEON });
    expect(url).not.toContain("neon.tech");
    expect(url).toContain("127.0.0.1");
  });
});

describe("e2eEnv — webServer env allowlist (secret sızıntısı yok)", () => {
  const HOSTILE_ENV = {
    PATH: "/usr/bin",
    SystemRoot: "C:/Windows",
    DATABASE_URL: NEON, // production — SIZMAMALI
    OPENROUTER_API_KEY: "sk-or-secret",
    META_ACCESS_TOKEN: "meta-secret",
    COMPOSIO_CONSUMER_API_KEY: "composio-secret",
    SOCIALDATA_API_KEY: "sd-secret",
    FAL_KEY: "fal-secret",
    CRON_SECRET: "cron-secret",
    CREDENTIAL_ENC_KEY: "enc-secret",
    GEMINI_API_KEY: "g-secret",
    VERCEL_APP_CLIENT_SECRET: "v-secret",
  };

  it("DATABASE_URL ephemeral'e ZORLANIR; production Neon geçmez", () => {
    const env = buildE2eServerEnv(HOSTILE_ENV);
    expect(env.DATABASE_URL).toContain("127.0.0.1");
    expect(env.DATABASE_URL).not.toContain("neon.tech");
  });

  it("HİÇBİR sağlayıcı secret'ının GERÇEK değeri child env'e geçmez (boş-gölge)", () => {
    const env = buildE2eServerEnv(HOSTILE_ENV);
    // Gölgelenmiş → "" (GERÇEK hostile değer DEĞİL); .env.local yeniden-yüklemesini bastırır
    expect(env.OPENROUTER_API_KEY).toBe("");
    expect(env.META_ACCESS_TOKEN).toBe("");
    expect(env.COMPOSIO_CONSUMER_API_KEY).toBe("");
    expect(env.SOCIALDATA_API_KEY).toBe("");
    expect(env.FAL_KEY).toBe("");
    expect(env.CRON_SECRET).toBe("");
    expect(env.CREDENTIAL_ENC_KEY).toBe("");
    expect(env.GEMINI_API_KEY).toBe("");
    expect(env.VERCEL_APP_CLIENT_SECRET).toBe("");
    // HİÇBİR gerçek secret DEĞERİ env'de bulunmaz
    const values = Object.values(env);
    for (const secret of ["sk-or-secret", "meta-secret", "composio-secret", "sd-secret", "fal-secret", "cron-secret", "enc-secret", "g-secret", "v-secret"]) {
      expect(values).not.toContain(secret);
    }
    expect(leakedSecretKeys(env)).toEqual([]); // boş-gölge + dummy SESSION_SECRET → sıfır GERÇEK sızıntı
    // Sistem/toolchain geçer; SESSION_SECRET dummy set edilir
    expect(env.PATH).toBe("/usr/bin");
    expect(env.SESSION_SECRET).toBe("e2e-session-secret-not-a-real-key");
  });
});
