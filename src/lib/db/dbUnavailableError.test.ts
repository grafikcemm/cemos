import { describe, it, expect } from "vitest";
import {
  isDbUnavailableError,
  isDbUnavailableMessage,
  DB_UNAVAILABLE_MESSAGE,
} from "./dbUnavailableError";

describe("isDbUnavailableError", () => {
  it("classifies PrismaClientInitializationError by NAME (bundle-safe)", () => {
    const err = Object.assign(new Error("connection failure"), {
      name: "PrismaClientInitializationError",
    });
    expect(isDbUnavailableError(err)).toBe(true);
  });

  it.each(["P1001", "P1002", "P1008", "P1017", "P2024"])(
    "classifies Prisma connectivity code %s",
    (code) => {
      const err = Object.assign(new Error("db problem"), { code });
      expect(isDbUnavailableError(err)).toBe(true);
    },
  );

  it("does NOT classify query-level Prisma codes (P2002 unique, P2025 not-found)", () => {
    expect(isDbUnavailableError(Object.assign(new Error("dup"), { code: "P2002" }))).toBe(false);
    expect(isDbUnavailableError(Object.assign(new Error("gone"), { code: "P2025" }))).toBe(false);
  });

  it("classifies the live Prisma P1001 message shape", () => {
    const err = new Error(
      "Invalid `prisma.ytVideo.findMany()` invocation:\n\nCan't reach database server at `ep-x.neon.tech:5432`",
    );
    expect(isDbUnavailableError(err)).toBe(true);
  });

  it("classifies the Neon data-transfer quota error (2026-07-23 live evidence)", () => {
    const err = new Error(
      "ERROR: Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.",
    );
    expect(isDbUnavailableError(err)).toBe(true);
  });

  it("classifies pool exhaustion (P2024 message)", () => {
    expect(
      isDbUnavailableError(new Error("Timed out fetching a new connection from the connection pool")),
    ).toBe(true);
  });

  it("does NOT classify bare socket errors (external fetch failures are not DB-down — review HIGH-1)", () => {
    // OpenRouter/Meta/YouTube fetch kesintileri aynı kodları taşır; onları
    // db_unavailable saymak yanlış 503 + breaker kirliliği + yalancı global bant
    // üretir. Prisma'nın kendi bağlantı hataları name/code/mesajla yakalanır.
    expect(isDbUnavailableError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(false);
    expect(isDbUnavailableError(new Error("connect ETIMEDOUT"))).toBe(false);
    expect(
      isDbUnavailableError(new Error("getaddrinfo ENOTFOUND openrouter.ai")),
    ).toBe(false);
    // Aynı socket hatası Prisma init error olarak sarıldığında yine yakalanır.
    expect(
      isDbUnavailableError(
        Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:5432"), {
          name: "PrismaClientInitializationError",
        }),
      ),
    ).toBe(true);
  });

  it("walks the cause chain (max 3 levels)", () => {
    const inner = Object.assign(new Error("down"), { code: "P1001" });
    const wrapped = new Error("service failed", { cause: new Error("mid", { cause: inner }) });
    expect(isDbUnavailableError(wrapped)).toBe(true);
  });

  it("rejects ordinary errors, strings, null", () => {
    expect(isDbUnavailableError(new Error("Geçersiz profil değeri"))).toBe(false);
    expect(isDbUnavailableError("Can't reach database server")).toBe(false); // nesne değil
    expect(isDbUnavailableError(null)).toBe(false);
    expect(isDbUnavailableError(undefined)).toBe(false);
  });
});

describe("isDbUnavailableMessage", () => {
  it("matches raw Prisma/Neon fragments", () => {
    expect(isDbUnavailableMessage("Can't reach database server at `h:5432`")).toBe(true);
    expect(isDbUnavailableMessage("Your project has exceeded the data transfer quota.")).toBe(true);
  });

  it("NEVER matches the fixed Turkish client message (no coercion loop)", () => {
    expect(isDbUnavailableMessage(DB_UNAVAILABLE_MESSAGE)).toBe(false);
  });

  it("does not match ordinary Turkish error copy", () => {
    expect(isDbUnavailableMessage("Bütçe aşıldı; çağrı yapılmadı.")).toBe(false);
  });
});
