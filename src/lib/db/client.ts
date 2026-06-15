import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Pin the Prisma query-engine binary on serverless (Vercel/AWS Lambda).
 *
 * The generated client is webpack-bundled into `.next/server/chunks`, so at
 * runtime Prisma's library engine resolves `libquery_engine-*.so.node` relative
 * to that chunk dir plus build-time absolute paths (`/vercel/path0/...`) that no
 * longer exist on the Lambda. `outputFileTracingIncludes` (next.config) actually
 * ships the binary into the function under `src/generated/prisma/`, but the
 * resolver never probes that location — so the file is present yet "not found".
 *
 * Fix: resolve the engine ourselves from `process.cwd()` (= `/var/task` on
 * Lambda) and point Prisma straight at it via `PRISMA_QUERY_ENGINE_LIBRARY`,
 * which the library engine honors and which bypasses path heuristics entirely.
 *
 * No-op locally: on Windows/native dev none of the rhel candidates exist, so the
 * env var stays unset and default engine resolution runs as before.
 */
const RHEL_ENGINE = "libquery_engine-rhel-openssl-3.0.x.so.node";

function pinPrismaEngine(): void {
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) return;

  // The rhel engine is only loadable on Linux (Vercel/Lambda). On Windows/mac
  // dev the rhel .so is ALSO generated locally (binaryTargets includes it), so a
  // plain fs.existsSync check would wrongly pin it and crash native dev/tests.
  // Restrict pinning to Linux; native engine resolution handles local.
  if (process.platform !== "linux") return;

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "src/generated/prisma", RHEL_ENGINE),
    path.join(cwd, ".next/server/chunks", RHEL_ENGINE),
    path.join(cwd, ".prisma/client", RHEL_ENGINE),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = candidate;
      return;
    }
  }
}

pinPrismaEngine();

/**
 * Neon serverless auto-suspends the compute after ~5 min idle. The first query
 * after suspend must wait while Neon wakes (~5-10s), but Postgres' default
 * `connect_timeout` (~5s) expires first → Prisma throws P1001 "Can't reach
 * database server" and the request 500s. Raising `connect_timeout` lets the
 * connection hold through the wake instead of failing fast. Applied centrally
 * here so both local dev and Vercel inherit it regardless of the env value.
 */
const CONNECT_TIMEOUT_SECONDS = "20";

function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", CONNECT_TIMEOUT_SECONDS);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
