/**
 * Unit coverage for the db-integration SAFETY GUARD (src/test/integration/guard.ts).
 *
 * The guard is the contract that keeps the DESTRUCTIVE `*.itest.ts` suite from
 * ever mutating production Neon. It must fail CLOSED: a remote/prod-looking
 * DATABASE_URL has to THROW, and only a positively-ephemeral host (localhost /
 * CI service / explicit opt-in) may pass. These run in the normal unit suite
 * (no DB, no connection) — the prisma client is stubbed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The guard imports the real prisma client; stub it. These tests exercise only
// the pure env-reading gate logic and never open a connection.
vi.mock("@/lib/db/client", () => ({ prisma: {} }));

import { shouldRunDbIntegration, assertEphemeralDatabase } from "./guard";

const KEYS = ["DB_INTEGRATION", "DATABASE_URL", "DATABASE_URL_IS_EPHEMERAL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("db-integration guard — opt-in gate (shouldRunDbIntegration)", () => {
  it("is false unless DB_INTEGRATION is exactly '1'", () => {
    delete process.env.DB_INTEGRATION;
    expect(shouldRunDbIntegration()).toBe(false);
    process.env.DB_INTEGRATION = "0";
    expect(shouldRunDbIntegration()).toBe(false);
    process.env.DB_INTEGRATION = "true";
    expect(shouldRunDbIntegration()).toBe(false);
    process.env.DB_INTEGRATION = "1";
    expect(shouldRunDbIntegration()).toBe(true);
  });
});

describe("db-integration guard — ephemeral fail-closed (assertEphemeralDatabase)", () => {
  it("THROWS on a remote/prod-looking DATABASE_URL (protects production)", () => {
    // Synthetic Neon-shaped host — NOT the real project URL.
    process.env.DATABASE_URL =
      "postgresql://u:p@ep-example-pooler-000000.eu-central-1.aws.neon.tech/db?sslmode=require";
    delete process.env.DATABASE_URL_IS_EPHEMERAL;
    expect(() => assertEphemeralDatabase()).toThrow(/refusing to run/i);
  });

  it("allows localhost / 127.0.0.1 / CI-service / docker hosts", () => {
    delete process.env.DATABASE_URL_IS_EPHEMERAL;
    for (const url of [
      "postgresql://cemos:cemos@localhost:5432/cemos_test",
      "postgresql://cemos:cemos@127.0.0.1:5432/cemos_test",
      "postgresql://cemos:cemos@postgres:5432/cemos_test",
      "postgresql://cemos:cemos@db:5432/cemos_test",
      "postgresql://cemos:cemos@host.docker.internal:5432/cemos_test",
    ]) {
      process.env.DATABASE_URL = url;
      expect(() => assertEphemeralDatabase(), url).not.toThrow();
    }
  });

  it("permits a non-local host ONLY with explicit DATABASE_URL_IS_EPHEMERAL=1", () => {
    process.env.DATABASE_URL = "postgresql://u:p@some-ephemeral-ci-host:5432/db";
    delete process.env.DATABASE_URL_IS_EPHEMERAL;
    expect(() => assertEphemeralDatabase()).toThrow();
    process.env.DATABASE_URL_IS_EPHEMERAL = "1";
    expect(() => assertEphemeralDatabase()).not.toThrow();
  });

  it("THROWS on an empty/unset DATABASE_URL (belt-and-suspenders)", () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_IS_EPHEMERAL;
    expect(() => assertEphemeralDatabase()).toThrow();
  });
});
