/**
 * REAL-Postgres integration test for FeedbackEvent idempotency.
 *
 * The feedback dedup has NO advisory lock — it relies ENTIRELY on the
 * `@@unique([idempotencyKey])` index catching the race between the pre-check and
 * the insert (feedback-service.ts pre-check → create → catch P2002 → re-read).
 * The mocked unit test hand-injects a `{code:"P2002"}` object; only a real
 * concurrent insert proves Postgres actually raises P2002 for this constraint and
 * commits exactly one row. This gates paid embeddings + TrainingExample writes.
 *
 * Gated: skipped unless DB_INTEGRATION=1; refuses a non-ephemeral DATABASE_URL.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { shouldRunDbIntegration, truncate, createTestAccount, prisma } from "@/test/integration/guard";

const RUN = shouldRunDbIntegration();

describe.skipIf(!RUN)("FeedbackEvent idempotencyKey — real Postgres unique constraint", () => {
  let accountId: string;

  beforeEach(async () => {
    await truncate(["Account"]); // CASCADE clears FeedbackEvent
    accountId = await createTestAccount("itest_fb_acc");
  });

  it("two concurrent creates with the SAME idempotencyKey → one row + one P2002", async () => {
    const data = { accountId, feedbackType: "rejected", idempotencyKey: "auto:same-key" };
    const results = await Promise.allSettled([
      prisma.feedbackEvent.create({ data }),
      prisma.feedbackEvent.create({ data }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.code).toBe("P2002");
    expect(await prisma.feedbackEvent.count()).toBe(1);
  });

  it("null idempotencyKey rows are NOT deduped (NULL-distinct unique index)", async () => {
    await prisma.feedbackEvent.create({ data: { accountId, feedbackType: "rejected", idempotencyKey: null } });
    await prisma.feedbackEvent.create({ data: { accountId, feedbackType: "rejected", idempotencyKey: null } });
    expect(await prisma.feedbackEvent.count()).toBe(2);
  });
});
