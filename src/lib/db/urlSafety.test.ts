import { describe, expect, it } from "vitest";
import {
  DbSafetyError,
  assertSafeDbPushTarget,
  assertSafeShadowUrl,
  classifyDatabaseUrl,
  sanitizeDbHostFingerprint,
  scanMigrationSqlForDestructiveOps,
} from "./urlSafety";

// GÜVENLİK: testlerde YALNIZ sahte URL'ler kullanılır — gerçek credential asla.
const FAKE_NEON =
  "postgresql://fakeuser:fakepass@ep-fake-branch-123456.eu-central-1.aws.neon.tech/fakedb?sslmode=require";
const FAKE_LOCAL = "postgresql://postgres:postgres@localhost:5432/shadow_scratch";
const FAKE_LOCAL_IP = "postgresql://u:p@127.0.0.1:5433/scratch";

describe("classifyDatabaseUrl", () => {
  it("yerel host'ları ephemeral sınıflar", () => {
    expect(classifyDatabaseUrl(FAKE_LOCAL)).toBe("local_ephemeral");
    expect(classifyDatabaseUrl(FAKE_LOCAL_IP)).toBe("local_ephemeral");
    expect(classifyDatabaseUrl("postgresql://u:p@db.internal.local:5432/x")).toBe(
      "local_ephemeral"
    );
    expect(classifyDatabaseUrl("file:./dev.db")).toBe("local_ephemeral");
  });

  it("uzak/bilinmeyen her host'u production-benzeri sayar (fail-closed)", () => {
    expect(classifyDatabaseUrl(FAKE_NEON)).toBe("production_like");
    expect(classifyDatabaseUrl("postgresql://u:p@some-random-host.example.com/db")).toBe(
      "production_like"
    );
    expect(classifyDatabaseUrl("prisma+postgres://u:p@fake-accelerate.prisma-data.net/db")).toBe(
      "production_like"
    );
  });

  it("parse edilemeyen girdi invalid", () => {
    expect(classifyDatabaseUrl("")).toBe("invalid");
    expect(classifyDatabaseUrl("not a url")).toBe("invalid");
  });
});

describe("sanitizeDbHostFingerprint", () => {
  it("credential/query/parola içermez", () => {
    const fp = sanitizeDbHostFingerprint(FAKE_NEON);
    expect(fp).toBe("ep-fake-branch-123456.eu-central-1.aws.neon.tech");
    expect(fp).not.toContain("fakeuser");
    expect(fp).not.toContain("fakepass");
    expect(fp).not.toContain("sslmode");
  });

  it("port'u korur, geçersiz girdiyi geri basmaz", () => {
    expect(sanitizeDbHostFingerprint(FAKE_LOCAL)).toBe("localhost:5432");
    expect(sanitizeDbHostFingerprint("x{}bad")).toBe("invalid-url");
  });
});

describe("assertSafeShadowUrl", () => {
  it("production-benzeri shadow hedefini reddeder", () => {
    expect(() => assertSafeShadowUrl(FAKE_NEON)).toThrowError(DbSafetyError);
    try {
      assertSafeShadowUrl(FAKE_NEON);
    } catch (err) {
      const e = err as DbSafetyError;
      expect(e.code).toBe("shadow_url_production_like");
      // Hata mesajı credential sızdırmaz.
      expect(e.message).not.toContain("fakepass");
      expect(e.message).not.toContain("fakeuser");
    }
  });

  it("yerel/ephemeral shadow hedefini kabul eder", () => {
    expect(() => assertSafeShadowUrl(FAKE_LOCAL)).not.toThrow();
    expect(() => assertSafeShadowUrl(FAKE_LOCAL_IP, FAKE_NEON)).not.toThrow();
  });

  it("ana DB ile aynı host'u reddeder (yerel olsa bile)", () => {
    expect(() => assertSafeShadowUrl(FAKE_LOCAL, FAKE_LOCAL)).toThrowError(
      /aynı/
    );
  });

  it("geçersiz shadow URL'i reddeder", () => {
    expect(() => assertSafeShadowUrl("garbage")).toThrowError(DbSafetyError);
  });
});

describe("assertSafeDbPushTarget", () => {
  it("production-benzeri hedefe db push'u engeller ve prosedüre yönlendirir", () => {
    try {
      assertSafeDbPushTarget(FAKE_NEON);
      expect.unreachable("throw beklenirdi");
    } catch (err) {
      const e = err as DbSafetyError;
      expect(e.code).toBe("db_push_production_blocked");
      expect(e.message).toContain("DB-SAFETY.md");
      expect(e.message).not.toContain("fakepass");
    }
  });

  it("yerel hedefe izin verir", () => {
    expect(() => assertSafeDbPushTarget(FAKE_LOCAL)).not.toThrow();
  });
});

describe("scanMigrationSqlForDestructiveOps", () => {
  it("additive SQL'de bulgu yok", () => {
    const sql = [
      '-- CreateTable',
      'CREATE TABLE "EvalRun" ("id" TEXT NOT NULL, CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id"));',
      'CREATE INDEX "EvalRun_kind_idx" ON "EvalRun"("kind");',
      'ALTER TABLE "Foo" ADD COLUMN "bar" TEXT NOT NULL DEFAULT \'\';',
    ].join("\n");
    expect(scanMigrationSqlForDestructiveOps(sql)).toEqual([]);
  });

  it("destructive kalıpları satır numarasıyla yakalar", () => {
    const sql = [
      'CREATE TABLE "A" ("id" TEXT);',
      'DROP TABLE "B";',
      'TRUNCATE "C";',
      'ALTER TABLE "D" DROP COLUMN "x";',
      'ALTER TABLE "E" ALTER COLUMN "y" TYPE VARCHAR(10);',
      'DELETE FROM "F";',
    ].join("\n");
    const codes = scanMigrationSqlForDestructiveOps(sql).map((f) => f.code);
    expect(codes).toContain("drop_table");
    expect(codes).toContain("truncate");
    expect(codes).toContain("drop_column");
    expect(codes).toContain("alter_type_narrowing");
    expect(codes).toContain("delete_all");
  });

  it("yorum satırlarını ve WHERE'li DELETE'i bulgu saymaz", () => {
    const sql = [
      "-- DROP TABLE eski_not (yalnız yorum)",
      'DELETE FROM "AuthAttempt" WHERE "updatedAt" < NOW();',
    ].join("\n");
    expect(scanMigrationSqlForDestructiveOps(sql)).toEqual([]);
  });
});
