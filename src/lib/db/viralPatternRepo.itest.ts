/**
 * REAL-Postgres integration test for viralPatternRepo.adjustSuccessScore.
 *
 * Proves the atomic `UPDATE ... successScore = LEAST(95, GREATEST(10, ROUND(
 * successScore + delta)))` at the DB: (1) two concurrent deltas BOTH land (no
 * lost update — a read-modify-write would drop one), (2) the clamp holds at the
 * database. viralPatternRepo has NO unit test at all, so this is its only proof.
 *
 * Gated: skipped unless DB_INTEGRATION=1; refuses a non-ephemeral DATABASE_URL.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { shouldRunDbIntegration, truncate, createTestAccount, prisma } from "@/test/integration/guard";
import { viralPatternRepo } from "./viralPatternRepo";

const RUN = shouldRunDbIntegration();

const seedAccount = () => createTestAccount("itest_viral_acc");

describe.skipIf(!RUN)("viralPatternRepo.adjustSuccessScore — real Postgres atomic clamp", () => {
  beforeEach(async () => {
    // CASCADE from Account clears ViralPattern + all account children.
    await truncate(["Account"]);
  });

  it("two concurrent +5 deltas BOTH land (atomic UPDATE, no lost update)", async () => {
    const accountId = await seedAccount();
    const p = await viralPatternRepo.createMined({ accountId, patternName: "p", successScore: 50 });

    await Promise.all([
      viralPatternRepo.adjustSuccessScore(p.id, 5),
      viralPatternRepo.adjustSuccessScore(p.id, 5),
    ]);

    // A read-modify-write would yield 55 (one delta clobbered). The atomic UPDATE
    // accumulates both under the row lock → 60.
    const after = await prisma.viralPattern.findUnique({ where: { id: p.id } });
    expect(after?.successScore).toBe(60);
  });

  it("clamps to [10, 95] at the database", async () => {
    const accountId = await seedAccount();
    const hi = await viralPatternRepo.createMined({ accountId, patternName: "hi", successScore: 93 });
    const lo = await viralPatternRepo.createMined({ accountId, patternName: "lo", successScore: 12 });

    await viralPatternRepo.adjustSuccessScore(hi.id, 20); // 113 → 95
    await viralPatternRepo.adjustSuccessScore(lo.id, -20); // -8 → 10

    expect((await prisma.viralPattern.findUnique({ where: { id: hi.id } }))?.successScore).toBe(95);
    expect((await prisma.viralPattern.findUnique({ where: { id: lo.id } }))?.successScore).toBe(10);
  });
});
