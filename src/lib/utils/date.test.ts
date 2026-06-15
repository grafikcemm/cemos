import { describe, it, expect } from "vitest";
import { getLocalDayBounds } from "./date";

describe("getLocalDayBounds", () => {
  it("should calculate correct Istanbul day bounds", () => {
    // 2026-06-01 at 12:00:00 UTC
    const ref = new Date("2026-06-01T12:00:00Z");
    const { start, end } = getLocalDayBounds("Europe/Istanbul", ref);

    // start should be 2026-06-01T00:00:00+03:00 which is 2026-05-31T21:00:00Z
    expect(start.toISOString()).toBe("2026-05-31T21:00:00.000Z");
    // end should be 2026-06-01T23:59:59.999+03:00 which is 2026-06-01T20:59:59.999Z
    expect(end.toISOString()).toBe("2026-06-01T20:59:59.999Z");
  });
});
