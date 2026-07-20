/**
 * Guard + helpers for the real-Postgres integration suite (`*.itest.ts`).
 *
 * SAFETY CONTRACT — these tests MUTATE the database. Two independent gates, both
 * required, so they can NEVER run against production Neon:
 *
 *   1. Opt-in:   DB_INTEGRATION="1"  (unset in the default `npm test`, so the
 *                integration suite is entirely skipped in the unit run).
 *   2. Ephemeral: the active DATABASE_URL must point at a localhost / CI-service
 *                / explicitly-flagged-ephemeral Postgres. If it looks remote, we
 *                THROW instead of mutating it — belt-and-suspenders against a
 *                misconfigured DB_INTEGRATION=1 hitting the prod pooler.
 */
import { prisma } from "@/lib/db/client";

/** Ephemeral-host hints. A CI `services: postgres` container is reachable at
 *  localhost (GitHub Actions) or the service alias inside a job container. */
const EPHEMERAL_HOST_HINTS = [
  "localhost",
  "127.0.0.1",
  "@postgres",
  "@db:",
  "@db/",
  "host.docker.internal",
];

/** Gate 1 — opt-in. `describe.skipIf(!shouldRunDbIntegration())` in every itest. */
export function shouldRunDbIntegration(): boolean {
  return process.env.DB_INTEGRATION === "1";
}

/** Gate 2 — refuse to mutate anything that is not obviously ephemeral. */
export function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const ephemeralOptIn = process.env.DATABASE_URL_IS_EPHEMERAL === "1";
  const looksEphemeral = EPHEMERAL_HOST_HINTS.some((h) => url.includes(h));
  if (!looksEphemeral && !ephemeralOptIn) {
    throw new Error(
      "db-integration: refusing to run DESTRUCTIVE tests — DATABASE_URL is not an " +
        "ephemeral/local Postgres. Point DATABASE_URL at a localhost/CI-service DB " +
        "(or set DATABASE_URL_IS_EPHEMERAL=1 for a non-local ephemeral host).",
    );
  }
}

/** Truncate the given tables (RESTART IDENTITY, CASCADE). Ephemeral-guarded. */
export async function truncate(tables: string[]): Promise<void> {
  assertEphemeralDatabase();
  for (const t of tables) {
    // Table names are literals from test code, never user input.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`);
  }
}

export { prisma };
