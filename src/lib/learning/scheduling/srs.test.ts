import { describe, it, expect } from "vitest";
import {
  nextSchedule,
  computeDueAt,
  masteryFromReviews,
  rollupPackMastery,
  type ScheduleState,
} from "./srs";

const fresh: ScheduleState = { ladderStep: 0, intervalDays: 1, ease: 2.5, lapses: 0 };

describe("nextSchedule", () => {
  it("advances ladder step on good", () => {
    const next = nextSchedule(fresh, 2);
    expect(next.ladderStep).toBe(1);
    expect(next.intervalDays).toBeGreaterThan(fresh.intervalDays);
  });

  it("resets to step 0 and counts a lapse on again", () => {
    const advanced: ScheduleState = { ladderStep: 3, intervalDays: 35, ease: 2.5, lapses: 0 };
    const next = nextSchedule(advanced, 0);
    expect(next.ladderStep).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.ease).toBeLessThan(advanced.ease);
  });

  it("keeps same step but lowers ease on hard", () => {
    const next = nextSchedule({ ...fresh, ladderStep: 2 }, 1);
    expect(next.ladderStep).toBe(2);
    expect(next.ease).toBeCloseTo(2.35, 5);
  });

  it("raises ease on easy and never exceeds the cap", () => {
    let s: ScheduleState = { ...fresh, ease: 2.95 };
    s = nextSchedule(s, 3);
    expect(s.ease).toBeLessThanOrEqual(3.0);
  });

  it("clamps ease at the floor on repeated again", () => {
    let s = fresh;
    for (let i = 0; i < 10; i++) s = nextSchedule(s, 0);
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
    expect(s.lapses).toBe(10);
  });

  it("does not advance past the last ladder step", () => {
    let s = fresh;
    for (let i = 0; i < 10; i++) s = nextSchedule(s, 2);
    expect(s.ladderStep).toBe(4); // [1,3,7,14,30] → lastIdx 4
  });
});

describe("computeDueAt", () => {
  it("adds the interval in days to now (deterministic)", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const due = computeDueAt(now, 3);
    expect(due.toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });
});

describe("masteryFromReviews", () => {
  it("is 0 with no attempts", () => {
    expect(masteryFromReviews([], 1)).toBe(0);
  });

  it("rewards all-correct with a long retained interval", () => {
    const score = masteryFromReviews([true, true, true, true, true], 14);
    expect(score).toBe(100);
  });

  it("penalizes wrong answers", () => {
    const allRight = masteryFromReviews([true, true, true, true], 7);
    const someWrong = masteryFromReviews([true, false, false, true], 7);
    expect(someWrong).toBeLessThan(allRight);
  });
});

describe("rollupPackMastery", () => {
  it("is 0 with no concepts", () => {
    expect(rollupPackMastery([])).toBe(0);
  });

  it("weights by importance", () => {
    const score = rollupPackMastery([
      { masteryScore: 100, importance: 90 },
      { masteryScore: 0, importance: 10 },
    ]);
    expect(score).toBeGreaterThan(50); // high-importance concept dominates
  });
});
