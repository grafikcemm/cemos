import { describe, it, expect } from "vitest";
import {
  isRemoteDatabaseUrl,
  enforceUnitDatabaseUrl,
  UNIT_DUMMY_DATABASE_URL,
} from "./unitDbGuard";

describe("unitDbGuard (WP-02f)", () => {
  it("classifies Neon/Supabase/remote hosts as remote", () => {
    expect(
      isRemoteDatabaseUrl(
        "postgresql://u:p@ep-long-sun-aph0vvvg-pooler.c-7.us-east-1.aws.neon.tech:5432/db",
      ),
    ).toBe(true);
    expect(isRemoteDatabaseUrl("postgresql://u:p@db.abc.supabase.co:5432/postgres")).toBe(true);
    expect(isRemoteDatabaseUrl("postgresql://u:p@mydb.internal.example.com:5432/x")).toBe(true);
  });

  it("accepts localhost/loopback and empty values", () => {
    expect(isRemoteDatabaseUrl("postgresql://u:p@127.0.0.1:5432/db")).toBe(false);
    expect(isRemoteDatabaseUrl("postgresql://u:p@localhost:5432/db")).toBe(false);
    expect(isRemoteDatabaseUrl(undefined)).toBe(false);
    expect(isRemoteDatabaseUrl("")).toBe(false);
  });

  it("enforce: THROWS on a remote URL (fail-closed, suite must not start)", () => {
    const env = { DATABASE_URL: "postgresql://u:p@x.neon.tech/db" } as NodeJS.ProcessEnv;
    expect(() => enforceUnitDatabaseUrl(env)).toThrow(/REMOTE/);
  });

  it("enforce: pins the dummy local URL otherwise", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(enforceUnitDatabaseUrl(env)).toBe(UNIT_DUMMY_DATABASE_URL);
    expect(env.DATABASE_URL).toBe(UNIT_DUMMY_DATABASE_URL);
    const env2 = { DATABASE_URL: "postgresql://u:p@localhost:5432/dev" } as NodeJS.ProcessEnv;
    enforceUnitDatabaseUrl(env2);
    expect(env2.DATABASE_URL).toBe(UNIT_DUMMY_DATABASE_URL);
  });

  it("the running unit suite itself is pinned to the dummy URL (global setup active)", () => {
    // Bu assertion setup dosyasının GERÇEKTEN yüklendiğini kanıtlar.
    expect(process.env.DATABASE_URL).toBe(UNIT_DUMMY_DATABASE_URL);
  });
});
