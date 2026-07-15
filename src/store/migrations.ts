/**
 * xagent-store persist migrasyonları — zustand'dan bağımsız saf modül.
 * localStorage key "xagent-store" KORUNUR; sadece version + migrate burada evrilir.
 */

export const XAGENT_STORE_VERSION = 9;

/**
 * localStorage anahtarı — LEGACY INVARIANT (AGENTS.md): "xagent-store" ASLA
 * yeniden adlandırılmaz (rename = kullanıcı state kaybı). Tek kaynak + test
 * garantisi için const'a alındı; DEĞERİ değişmez.
 */
export const XAGENT_STORE_NAME = "xagent-store";

/** Birleştirilen sekme → host + alt-görünüm (persist edilmiş activeTab göçü). */
const FOLDED_TAB_SEED: Record<string, { activeTab: string; viewKey: "libraryView" | "radarView"; view: string }> = {
  "prompt-kutuphanesi": { activeTab: "library", viewKey: "libraryView", view: "prompts" },
  "pattern-library": { activeTab: "library", viewKey: "libraryView", view: "patterns" },
  "content-radar": { activeTab: "news-pool", viewKey: "radarView", view: "content" },
  "repo-radar": { activeTab: "news-pool", viewKey: "radarView", view: "repo" },
};

/** IA v2 (v8): kaldırılan/yeniden adlandırılan sekmeler → canlı id. */
const IA_V2_TAB_SEED: Record<string, string> = {
  library: "viral-library",
  patterns: "pattern-library",
  "prompt-kutuphanesi": "prompt-library",
  "content-intel": "discovery-engine",
  "content-radar": "news-pool",
  "repo-radar": "news-pool",
  "ai-rankings": "toolbox",
  "weekly-learning-report": "morning",
  "training-center": "morning",
  instagram: "morning",
};

/**
 * Rebuild (v9): 3-görevli IA. YALNIZ ABSORBED ekranlar yeni evlerine taşınır.
 * REDESIGNED-ADVANCED id'leri (news-pool/youtube/flow-radar/discovery-engine/
 * source-intelligence) DEĞİŞTİRİLMEZ — persist edilmiş `youtube` yeni tasarlanan
 * advanced YouTube ekranını açmaya devam eder. toolbox/costs/system/settings
 * id'leri sabit (Toolbox utility + Profil yüzeyleri aynı id'yi kullanır).
 */
const ABSORBED_TAB_SEED_V9: Record<string, string> = {
  "daily-queue": "morning",
  "viral-library": "lib-tumu",
  "keyword-library": "lib-tumu",
  "prompt-library": "lib-tumu",
  "pattern-library": "lib-tumu",
  "learn-dashboard": "lib-ogrenme",
  instagram: "plan-seriler",
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
  if (version < 8) {
    // IA v2: platform-bazlı gruplar. Kaldırılan/yeniden adlandırılan sekmeler
    // canlı id'lere iner (TAB_ALIASES ile aynı harita — render-time yedeği var).
    const seed = IA_V2_TAB_SEED[state.activeTab as string];
    if (seed) state.activeTab = seed;
    // Radar "İçerik" görünümü kaldırıldı → Haberler'e düş.
    if (state.radarView === "content") state.radarView = "news";
  }
  if (version < 9) {
    // Rebuild 3-görevli IA: YALNIZ ABSORBED activeTab yeni eve taşınır.
    // Advanced id'ler (news-pool/youtube/flow-radar/discovery-engine/
    // source-intelligence) ve utility/profil id'leri pass-through.
    const seed = ABSORBED_TAB_SEED_V9[state.activeTab as string];
    if (seed) state.activeTab = seed;
  }
  return state;
}
