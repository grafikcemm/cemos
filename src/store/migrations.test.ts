import { describe, it, expect } from "vitest";
import { XAGENT_STORE_VERSION, migrateXAgentStore } from "./migrations";

function v5State(): Record<string, unknown> {
  return {
    activeTab: "daily-queue",
    activeChannel: "maskulenkod",
    newsItems: [{ id: "n1" }],
    savedTweets: [{ id: "t1" }],
    patterns: [{ id: "p1" }],
    postsPerSource: 10,
    maxPostAge: 6,
    automationEnabled: true,
    scanIntervalHours: 12,
    lastScanTime: "2026-06-10T12:00:00.000Z",
    channelScanSchedule: { grafikcem: "daily", maskulenkod: "monday" },
    lastChannelScanDate: { grafikcem: "2026-06-10", maskulenkod: null },
    monthlyBudgetUSD: 6,
    monthlyResetDate: "2026-07-01T00:00:00.000Z",
  };
}

describe("migrateXAgentStore", () => {
  it("should_be_version_7", () => {
    expect(XAGENT_STORE_VERSION).toBe(7);
  });

  it("should_return_state_unchanged_when_migrating_from_v5_to_v6", () => {
    const input = v5State();
    const snapshot = structuredClone(input);
    const result = migrateXAgentStore(input, 5);
    expect(result).toEqual(snapshot);
  });

  it("should_set_activeTab_morning_when_version_below_5", () => {
    const result = migrateXAgentStore({ activeTab: "flow" }, 4);
    expect(result.activeTab).toBe("morning");
  });

  it("should_delete_server_owned_fields_when_version_below_4", () => {
    const input: Record<string, unknown> = {
      flowItems: [],
      queueItems: [],
      watchedSources: [],
      todayCost: 1,
      dailyCosts: [],
      monthlyCost: 2,
      todayScanCount: 3,
      todayGenerateCount: 4,
      savedTweets: [{ id: "keep" }],
    };
    const result = migrateXAgentStore(input, 3);
    for (const key of [
      "flowItems", "queueItems", "watchedSources", "todayCost",
      "dailyCosts", "monthlyCost", "todayScanCount", "todayGenerateCount",
    ]) {
      expect(result).not.toHaveProperty(key);
    }
    expect(result.savedTweets).toEqual([{ id: "keep" }]);
  });

  it("should_seed_channel_scan_schedule_when_version_below_3", () => {
    const result = migrateXAgentStore({}, 2);
    expect(result.channelScanSchedule).toEqual({ grafikcem: "daily", maskulenkod: "monday" });
    expect(result.lastChannelScanDate).toEqual({ grafikcem: null, maskulenkod: null });
    expect(result.scanIntervalHours).toBe(24);
  });

  it("should_be_noop_when_already_at_current_version", () => {
    // Rollback güvenliği: v6 persist'i v6 migrate'inden değişmeden çıkar
    const input = v5State();
    const snapshot = structuredClone(input);
    expect(migrateXAgentStore(input, XAGENT_STORE_VERSION)).toEqual(snapshot);
  });
});
