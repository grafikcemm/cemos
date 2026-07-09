/**
 * CemOS nav yapılandırması — tek doğruluk kaynağı.
 * Saf TS: React yok; Sidebar, AppShell, vitest ve e2e helper aynı modülü kullanır.
 *
 * IA v2 (2026-07): platform-bazlı gruplar — Bugün / Twitter / Kütüphane / Youtube
 * + Araçlar utility kümesi. Eski alanlar (Üret/Keşfet/Öğren/Sosyal Medya) ve
 * kaldırılan sekmeler (instagram, training-center, weekly-learning-report,
 * ai-rankings, content-intel, library host) TAB_ALIASES ile canlı id'lere iner.
 */

export type NavTab = { readonly id: string; readonly label: string };

export type NavGroupId = "bugun" | "twitter" | "instagram" | "kutuphane" | "youtube";

export type NavGroup = {
  readonly id: NavGroupId;
  readonly label: string;
  readonly tabs: readonly NavTab[];
  /** Tanımlı ama render edilmez. */
  readonly hidden?: boolean;
};

/** Grup dışında, doğrudan barda duran sekmeler. */
export const DIRECT_TABS: readonly NavTab[] = [{ id: "morning", label: "Bugün" }];

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "bugun",
    label: "Bugün",
    tabs: [
      { id: "daily-queue", label: "Günlük Kuyruk" },
      { id: "news-pool", label: "Haberler" },
    ],
  },
  {
    id: "twitter",
    label: "Twitter",
    tabs: [
      { id: "flow-radar", label: "Viral Radar" },
      { id: "discovery-engine", label: "Keşif Motoru" },
      { id: "source-intelligence", label: "X Hesabı Kaynakları" },
      { id: "viral-library", label: "Viral Kütüphane" },
    ],
  },
  {
    // Sprint 8 (C6): TEK Instagram alan ekranı — Rakip Radarı | Reels
    // alt-sekmeleri ekran içinde yaşar; yeni top-level sekme çoğalmaz.
    id: "instagram",
    label: "Instagram",
    tabs: [{ id: "instagram", label: "Instagram" }],
  },
  {
    id: "kutuphane",
    label: "Kütüphane",
    tabs: [
      { id: "keyword-library", label: "Anahtar Kelime Kütüphanesi" },
      { id: "prompt-library", label: "Prompt Kütüphanesi" },
      { id: "pattern-library", label: "Pattern Kütüphanesi" },
    ],
  },
  {
    id: "youtube",
    label: "Youtube",
    tabs: [{ id: "youtube", label: "YouTube Fırsat Motoru" }],
  },
];

/**
 * XAgentApp render alias'ları + persist edilmiş legacy activeTab değerleri.
 * Her eski id canlı bir ekrana iner — ölü sekme yok. Alias ANAHTARLARI asla
 * canlı tab id'leriyle çakışamaz (test garantisi: navConfig.test.ts).
 */
export const TAB_ALIASES: Readonly<Record<string, string>> = {
  flow: "flow-radar",
  queue: "daily-queue",
  sources: "source-intelligence",
  // Kütüphane host (library) dağıldı: Tweetler → Viral Kütüphane (Twitter),
  // Promptlar/Patternler → Kütüphane grubunda bağımsız sekmeler.
  library: "viral-library",
  patterns: "pattern-library",
  "prompt-kutuphanesi": "prompt-library",
  // Radar host = Haberler (news-pool); İçerik görünümü kaldırıldı.
  "content-radar": "news-pool",
  "repo-radar": "news-pool",
  // İçerik Zekası Keşif Motoru'na eridi.
  "content-intel": "discovery-engine",
  // Kaldırılan sekmeler → en yakın canlı ekran.
  "ai-rankings": "toolbox",
  "weekly-learning-report": "morning",
  "training-center": "morning",
  // NOT: "instagram" alias'ı kaldırıldı — Sprint 8'de canlı ekran oldu
  // (persist edilmiş legacy activeTab="instagram" artık doğrudan yeni
  // Instagram alanına iner; alias anahtarı canlı id ile çakışamaz kuralı).
};

/** Folded/legacy sekme id → host + alt-görünüm (deep-link seeding için). */
export function seedTargetForTab(tabId: string): { host: string; view?: string } {
  const map: Record<string, { host: string; view: string }> = {
    "content-radar": { host: "news-pool", view: "news" },
    "repo-radar": { host: "news-pool", view: "repo" },
  };
  return map[tabId] ?? { host: normalizeTabId(tabId) };
}

export function normalizeTabId(tabId: string): string {
  return TAB_ALIASES[tabId] ?? tabId;
}

/** Sekmenin ait olduğu grup; direkt sekme veya bilinmeyen id → null. */
export function resolveGroupForTab(tabId: string): NavGroupId | null {
  const id = normalizeTabId(tabId);
  if (id === "learn-dashboard") return "youtube";
  for (const group of NAV_GROUPS) {
    if (group.tabs.some((tab) => tab.id === id)) return group.id;
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Birincil alan katmanı (sol sidebar IA).
 *
 * IA v2'de alanlar ile gruplar bire bir örtüşür; alan katmanı `morning`
 * direkt sekmesini Bugün grubuna ve koşullu `learn-dashboard`'ı Youtube
 * grubuna projekte eder. Yeni id YOK → store migration yalnız alias'lar için.
 * ──────────────────────────────────────────────────────────────────────── */

export type PrimaryAreaId = NavGroupId;

export type PrimaryArea = {
  readonly id: PrimaryAreaId;
  readonly label: string;
  /** lucide-react ikon adı. */
  readonly icon: string;
  readonly tabIds: readonly string[];
};

export const PRIMARY_AREAS: readonly PrimaryArea[] = [
  {
    id: "bugun",
    label: "Bugün",
    icon: "Sunrise",
    tabIds: ["morning", "daily-queue", "news-pool"],
  },
  {
    id: "twitter",
    label: "Twitter",
    icon: "AtSign",
    tabIds: ["flow-radar", "discovery-engine", "source-intelligence", "viral-library"],
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: "Camera",
    tabIds: ["instagram"],
  },
  {
    id: "kutuphane",
    label: "Kütüphane",
    icon: "Library",
    tabIds: ["keyword-library", "prompt-library", "pattern-library"],
  },
  {
    id: "youtube",
    label: "Youtube",
    icon: "MonitorPlay",
    // Youtube Öğrenme Kütüphanesi (learn-dashboard) yalnız
    // NEXT_PUBLIC_LEARN_ENABLED=true iken görünür (build-time inline).
    tabIds: [
      "youtube",
      ...(process.env.NEXT_PUBLIC_LEARN_ENABLED === "true" ? ["learn-dashboard"] : []),
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────────────
 * Yardımcı (utility) sekmeler — birincil alanların DIŞINDA, sol sidebar
 * "Araçlar" kümesinde yaşar (Toolbox / Maliyetler / Ayarlar).
 * resolveAreaForTab bunlar için null döner (kasıtlı); shell isUtilityTab ile ele alır.
 * ──────────────────────────────────────────────────────────────────────── */

export type UtilityTab = {
  readonly id: string;
  readonly label: string;
  /** lucide-react ikon adı. */
  readonly icon: string;
};

export const UTILITY_TABS: readonly UtilityTab[] = [
  { id: "toolbox", label: "Toolbox", icon: "Wrench" },
  { id: "costs", label: "Maliyetler", icon: "DollarSign" },
  { id: "settings", label: "Ayarlar", icon: "Settings" },
];

/** Sekme yardımcı kümeye mi ait? (alias normalize edilir) */
export function isUtilityTab(tabId: string): boolean {
  const id = normalizeTabId(tabId);
  return UTILITY_TABS.some((t) => t.id === id);
}

/** Tüm sekmelerin id→label sözlüğü (DIRECT_TABS + NAV_GROUPS + utility tek kaynak). */
const TAB_LABELS: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const tab of DIRECT_TABS) map[tab.id] = tab.label;
  for (const group of NAV_GROUPS) {
    for (const tab of group.tabs) map[tab.id] = tab.label;
  }
  for (const tab of UTILITY_TABS) map[tab.id] = tab.label;
  // Youtube Öğrenme Kütüphanesi — NAV_GROUPS dışında yaşar (koşullu projeksiyon).
  map["learn-dashboard"] = "Youtube Öğrenme Kütüphanesi";
  return map;
})();

/** Sekmenin ait olduğu birincil alan; bilinmeyen/eşleşmeyen id → null. */
export function resolveAreaForTab(tabId: string): PrimaryAreaId | null {
  const id = normalizeTabId(tabId);
  for (const area of PRIMARY_AREAS) {
    if (area.tabIds.includes(id)) return area.id;
  }
  return null;
}

/** Alanın ilk (varsayılan) sekme id'si. */
export function firstTabOfArea(areaId: PrimaryAreaId): string {
  const area = PRIMARY_AREAS.find((a) => a.id === areaId);
  return area ? area.tabIds[0] : DIRECT_TABS[0].id;
}

/** Alanın ikincil sekmeleri (SubNav için), etiketler tek-kaynaktan. */
export function subTabsOfArea(areaId: PrimaryAreaId): { id: string; label: string }[] {
  const area = PRIMARY_AREAS.find((a) => a.id === areaId);
  if (!area) return [];
  return area.tabIds.map((id) => ({ id, label: TAB_LABELS[id] ?? id }));
}
