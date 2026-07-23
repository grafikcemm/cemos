import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dbErrorResponse, __resetDbErrorLogForTests } from "./dbErrorResponse";
import { DB_UNAVAILABLE_MESSAGE } from "@/lib/db/dbUnavailableError";
import { __resetDbCircuitForTests, getDbCircuitState } from "@/lib/db/dbCircuit";

describe("dbErrorResponse", () => {
  beforeEach(() => {
    __resetDbCircuitForTests();
    __resetDbErrorLogForTests();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const prismaInitError = () =>
    Object.assign(
      new Error(
        "Can't reach database server at `ep-fake-branch-123456-pooler.c-1.us-east-1.aws.neon.tech:5432`",
      ),
      { name: "PrismaClientInitializationError" },
    );

  it("maps a classified DB-unavailable error to 503 {code:'db_unavailable', retryable:true} with the FIXED message", async () => {
    const res = dbErrorResponse(prismaInitError());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const json = await res!.json();
    expect(json).toMatchObject({
      success: false,
      error: DB_UNAVAILABLE_MESSAGE,
      code: "db_unavailable",
      retryable: true,
    });
    // Ham hostname istemciye SIZMAZ.
    expect(JSON.stringify(json)).not.toContain("neon.tech");
  });

  it("merges extra fields into the body", async () => {
    const res = dbErrorResponse(prismaInitError(), { stage: "list" });
    expect(await res!.json()).toMatchObject({ code: "db_unavailable", stage: "list" });
  });

  it("returns null for non-DB errors (route falls through to its own handling)", () => {
    expect(dbErrorResponse(new Error("Geçersiz alan"))).toBeNull();
    expect(dbErrorResponse(Object.assign(new Error("dup"), { code: "P2002" }))).toBeNull();
    expect(dbErrorResponse(null)).toBeNull();
  });

  it("records a circuit-breaker failure per classified error", () => {
    dbErrorResponse(prismaInitError());
    dbErrorResponse(prismaInitError());
    expect(getDbCircuitState().consecutiveFailures).toBe(2);
    expect(getDbCircuitState().open).toBe(false);
    dbErrorResponse(prismaInitError());
    expect(getDbCircuitState().open).toBe(true);
  });

  it("logs server-side REDACTED and rate-limits to one line per interval", () => {
    const spy = vi.mocked(console.error);
    dbErrorResponse(prismaInitError());
    dbErrorResponse(prismaInitError());
    dbErrorResponse(prismaInitError());
    const dbLogs = spy.mock.calls.filter((c) => c[0] === "[db-unavailable]");
    expect(dbLogs).toHaveLength(1);
    // Redakte: çıplak host log'a da yazılmaz (SEC-M1 kalıbı redactSecrets'ta).
    expect(String(dbLogs[0][1])).not.toContain("ep-fake-branch");
  });
});
