/**
 * xagent-store persist migrasyonları — zustand'dan bağımsız saf modül.
 * localStorage key "xagent-store" KORUNUR; sadece version + migrate burada evrilir.
 */

export const XAGENT_STORE_VERSION = 7;

/** Birleştirilen sekme → host + alt-görünüm (persist edilmiş activeTab göçü). */
const FOLDED_TAB_SEED: Record<string, { activeTab: string; viewKey: "libraryView" | "radarView"; view: string }> = {
  "prompt-kutuphanesi": { activeTab: "library", viewKey: "libraryView", view: "prompts" },
  "pattern-library": { activeTab: "library", viewKey: "libraryView", view: "patterns" },
  "content-radar": { activeTab: "news-pool", viewKey: "radarView", view: "content" },
  "repo-radar": { activeTab: "news-pool", viewKey: "radarView", view: "repo" },
};

export function migrateXAgentStore(persisted: unknown, version: number): Record<string, unknown> {
  const state = persisted as Record<string, unknown>;
  if (version < 3) {
    state.channelScanSchedule = { grafikcem: "daily", maskulenkod: "monday" };
    state.lastChannelScanDate = { grafikcem: null, maskulenkod: null };
    state.scanIntervalHours = 24;
  }
  if (version < 4) {
    // Source/queue/cost alanları DB/API'den geliyor — localStorage'dan kaldır
    delete state.flowItems;
    delete state.queueItems;
    delete state.watchedSources;
    delete state.todayCost;
    delete state.dailyCosts;
    delete state.monthlyCost;
    delete state.todayScanCount;
    delete state.todayGenerateCount;
  }
  if (version < 5) {
    // Morning Dashboard is the new entry point — land existing users there.
    state.activeTab = "morning";
  }
  if (version < 6) {
    // Faz B (CemOS rebrand): persist şeması değişmedi — bilinçli pass-through.
  }
  if (version < 7) {
    // Agresif birleştirme: prompt/pattern → Kütüphane, content/repo → Radar host.
    // Persist edilmiş folded activeTab'i host + alt-görünüme taşı (ölü sekme yok).
    const seed = FOLDED_TAB_SEED[state.activeTab as string];
    if (seed) {
      state.activeTab = seed.activeTab;
      state[seed.viewKey] = seed.view;
    }
  }
  return state;
}
