import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { isCronAuthorized, isCronSecretConfigured, isProductionRuntime } from "./cronAuth";

function makeReq(authHeader?: string) {
  return new NextRequest("http://localhost:3000/api/cron/daily", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("isCronAuthorized", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("allows everything when no CRON_SECRET is configured (local/dev)", () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(makeReq())).toBe(true);
  });

  it("rejects a missing or wrong bearer token when CRON_SECRET is set", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronAuthorized(makeReq())).toBe(false);
    expect(isCronAuthorized(makeReq("Bearer wrong"))).toBe(false);
  });

  it("accepts the correct bearer token", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronAuthorized(makeReq("Bearer s3cret"))).toBe(true);
  });
});

describe("isCronAuthorized — production fail-closed", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed on Vercel prod when no secret is set", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL", "1");
    expect(isCronAuthorized(makeReq())).toBe(false);
  });

  it("fails closed when NODE_ENV=production and no secret is set", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isCronAuthorized(makeReq())).toBe(false);
  });

  it("stays open in dev when no secret is set", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isCronAuthorized(makeReq())).toBe(true);
  });
});

describe("health signal helpers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("isCronSecretConfigured reflects env presence", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronSecretConfigured()).toBe(false);
    vi.stubEnv("CRON_SECRET", "x");
    expect(isCronSecretConfigured()).toBe(true);
  });

  it("isProductionRuntime true on Vercel or NODE_ENV=production", () => {
    vi.stubEnv("VERCEL", "1");
    expect(isProductionRuntime()).toBe(true);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isProductionRuntime()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(isProductionRuntime()).toBe(false);
  });
});
