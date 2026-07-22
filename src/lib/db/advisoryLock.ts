import type { Prisma } from "@/generated/prisma/client";

/**
 * Acquire a transaction-scoped Postgres advisory lock inside `tx`.
 *
 * `pg_advisory_xact_lock()` returns `void`. Prisma's `$queryRaw` tries to
 * deserialize the returned column and throws
 *   "Failed to deserialize column of type 'void'"
 * against real Postgres (the mocked unit suite never hits this, which is why it
 * went unnoticed until the real-Postgres integration suite ran). Wrapping the
 * call in a derived table and projecting a concrete `1` gives Prisma a
 * deserializable column while still evaluating the volatile lock function, so
 * the lock is acquired and held until the transaction ends (COMMIT/ROLLBACK).
 *
 * Kept as $queryRaw (not $executeRaw) so existing mocks that stub/assert
 * `tx.$queryRaw` keep working unchanged.
 */
export async function acquireXactAdvisoryLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS _adv`;
}
