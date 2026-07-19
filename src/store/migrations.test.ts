import { describe, it, expect } from "vitest";
import { XAGENT_STORE_VERSION, XAGENT_STORE_NAME, migrateXAgentStore } from "./migrations";

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
  it("should_be_version_9", () => {
    expect(XAGENT_STORE_VERSION).toBe(9);
  });

  it("should_keep_localStorage_key_xagent_store_LEGACY_INVARIANT", () => {
    // Rename = kullanıcı state kaybı (AGENTS.md). Bu değer ASLA değişmez.
    expect(XAGENT_STORE_NAME).toBe("xagent-store");
  });

  // ── v9 (rebuild 3-görevli IA): ABSORBED → yeni ev ──
  it("should_migrate_absorbed_tabs_to_new_homes_when_version_below_9", () => {
    expect(migrateXAgentStore({ activeTab: "daily-queue" }, 8).activeTab).toBe("morning");
    expect(migrateXAgentStore({ activeTab: "viral-library" }, 8).activeTab).toBe("lib-tumu");
    expect(migrateXAgentStore({ activeTab: "keyword-library" }, 8).activeTab).toBe("lib-tumu");
    expect(migrateXAgentStore({ activeTab: "prompt-library" }, 8).activeTab).toBe("lib-tumu");
    expect(migrateXAgentStore({ activeTab: "pattern-library" }, 8).activeTab).toBe("lib-tumu");
    expect(migrateXAgentStore({ activeTab: "learn-dashboard" }, 8).activeTab).toBe("lib-ogrenme");
    expect(migrateXAgentStore({ activeTab: "instagram" }, 8).activeTab).toBe("plan-seriler");
  });

  it("should_NOT_touch_redesigned_advanced_ids_when_version_below_9", () => {
    // REDESIGNED-ADVANCED: persist edilmiş id yeni tasarlanan advanced ekranı açar.
    for (const id of ["news-pool", "youtube", "flow-radar", "discovery-engine", "source-intelligence"]) {
      expect(migrateXAgentStore({ activeTab: id }, 8).activeTab).toBe(id);
    }
  });

  it("should_pass_through_utility_and_profile_ids_when_version_below_9", () => {
    for (const id of ["toolbox", "costs", "system", "settings"]) {
      expect(migrateXAgentStore({ activeTab: id }, 8).activeTab).toBe(id);
    }
  });

  it("should_leave_unknown_activeTab_untouched_at_v9_shell_guard_handles_it", () => {
    expect(migrateXAgentStore({ activeTab: "totally-unknown" }, 8).activeTab).toBe("totally-unknown");
  });

  // ── v8 (IA v2): kaldırılan/yeniden adlandırılan sekmeler ──
  it("should_migrate_retired_tabs_to_live_screens_when_version_below_8", () => {
    // v7 başlangıç: v8 zinciriyle canlı id'ye iner (v9 seed'inde olmayanlar sabit kalır).
    // ADR-045: Eğitim Merkezi'nin geri bildirim/öğrenme geçmişi Profil/Hafıza'ya birleşti.
    expect(migrateXAgentStore({ activeTab: "training-center" }, 7).activeTab).toBe("profile-memory");
    expect(migrateXAgentStore({ activeTab: "weekly-learning-report" }, 7).activeTab).toBe("morning");
    expect(migrateXAgentStore({ activeTab: "ai-rankings" }, 7).activeTab).toBe("toolbox");
    expect(migrateXAgentStore({ activeTab: "content-intel" }, 7).activeTab).toBe("discovery-engine");
  });

  it("should_chain_v8_then_v9_for_absorbed_ids_from_old_versions", () => {
    // "library" v8→viral-library, sonra v9→lib-tumu (zincir).
    expect(migrateXAgentStore({ activeTab: "library" }, 7).activeTab).toBe("lib-tumu");
    expect(migrateXAgentStore({ activeTab: "patterns" }, 7).activeTab).toBe("lib-tumu");
  });

  it("should_normalize_removed_radar_content_view_when_version_below_8", () => {
    const result = migrateXAgentStore({ activeTab: "news-pool", radarView: "content" }, 7);
    expect(result.radarView).toBe("news");
    expect(migrateXAgentStore({ radarView: "repo" }, 7).radarView).toBe("repo");
  });

  it("should_preserve_data_fields_and_apply_tab_rules_when_upgrading_from_v6", () => {
    // v6 persist'i güncel sürüme yükseltilir: <7/<8/<9 adımları çalışır.
    // daily-queue ABSORBED → morning (v9); TÜM veri alanları korunur (ölü göç yok).
    const input = v5State(); // activeTab: "daily-queue"
    const result = migrateXAgentStore(input, 6);
    expect(result.activeTab).toBe("morning");
    expect(result.savedTweets).toEqual([{ id: "t1" }]);
    expect(result.channelScanSchedule).toEqual({ grafikcem: "daily", maskulenkod: "monday" });
    expect(result.monthlyBudgetUSD).toBe(6);
    expect(result.lastScanTime).toBe("2026-06-10T12:00:00.000Z");
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
    // Rollback güvenliği: v9 persist'i v9 migrate'inden değişmeden çıkar.
    const input = { activeTab: "plan-firsatlar", radarView: "news" };
    const snapshot = structuredClone(input);
    expect(migrateXAgentStore(input, XAGENT_STORE_VERSION)).toEqual(snapshot);
  });
});
