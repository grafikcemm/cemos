import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Real-Postgres integration suite — the ".itest.ts" files under src.
 *
 * These tests exercise SQL semantics a mocked Prisma can NEVER prove:
 *   - `pg_advisory_xact_lock` mutual exclusion (reservation, cron single-flight)
 *   - unique-constraint violations → P2002 (feedback / board idempotency)
 *   - atomic `UPDATE ... LEAST/GREATEST` clamps under concurrent writers
 *   - upsert idempotency (OperatorSetting)
 *
 * They MUTATE the database, so they are:
 *   - EXCLUDED from the default `npm test` (main config only globs *.test.ts).
 *   - Gated behind DB_INTEGRATION=1 (see src/test/integration/guard.ts).
 *   - Refused against any non-ephemeral DATABASE_URL (prod-Neon guard).
 *
 * Run: `npm run test:db-integration` with DB_INTEGRATION=1 and a local/CI
 * ephemeral Postgres in DATABASE_URL (see .github/workflows/db-integration.yml).
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.itest.ts"],
    // Shared DB → files must not run in parallel; cases run sequentially.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
