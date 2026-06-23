/**
 * CemOS nav yapılandırması — tek doğruluk kaynağı.
 * Saf TS: React yok; Topbar, NavGroups, vitest ve e2e helper aynı modülü kullanır.
 */

export type NavTab = { readonly id: string; readonly label: string };

export type NavGroupId = "x" | "haber" | "sistem" | "instagram" | "youtube";

export type NavGroup = {
  readonly id: NavGroupId;
  readonly label: string;
  readonly tabs: readonly NavTab[];
  /** Tanımlı ama render edilmez — Faz C (YouTube) / Faz D (Instagram) açar. */
  readonly hidden?: boolean;
};

/** Grup dışında, doğrudan barda duran sekmeler. */
export const DIRECT_TABS: readonly NavTab[] = [{ id: "morning", label: "Bugün" }];

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "x",
    label: "X",
    tabs: [
      { id: "discovery-engine", label: "Keşif Motoru" },
      { id: "daily-queue", label: "Günlük Kuyruk" },
      { id: "flow-radar", label: "Viral Radar" },
      { id: "source-intelligence", label: "X Hesabı Kaynakları" },
    ],
  },
  {
    id: "haber",
    label: "Haber",
    tabs: [
      { id: "news-pool", label: "Radar" },
      { id: "content-intel", label: "İçerik Zekası" },
      { id: "ai-rankings", label: "AI Sıralama" },
      { id: "toolbox", label: "Toolbox" },
      { id: "library", label: "Kütüphane" },
    ],
  },
  {
    id: "sistem",
    label: "Sistem",
    tabs: [
      { id: "costs", label: "Maliyetler" },
      { id: "settings", label: "Ayarlar" },
      { id: "weekly-learning-report", label: "Haftalık Öğrenme Raporu" },
      { id: "training-center", label: "Eğitim Merkezi" },
    ],
  },
  { id: "instagram", label: "Instagram", tabs: [{ id: "instagram", label: "Instagram" }] },
  {
    id: "youtube",
    label: "YouTube",
    tabs: [{ id: "youtube", label: "Fırsat Motoru" }],
  },
];

/**
 * XAgentApp render alias'ları + persist edilmiş legacy activeTab değerleri.
 * Grup vurgusu ve normalize için; render tarafı XAgentApp'te zaten ele alınıyor.
 */
export const TAB_ALIASES: Readonly<Record<string, string>> = {
  flow: "flow-radar",
  queue: "daily-queue",
  // "sources" (Keşfet → Kaynaklar) merged into "source-intelligence".
  sources: "source-intelligence",
  // Agresif birleştirme: folded sekmeler host'a yönlenir (ölü sekme yok).
  // Kütüphane host = Tweetler / Promptlar / Patternler.
  patterns: "library",
  "pattern-library": "library",
  "prompt-kutuphanesi": "library",
  // Radar host = Haberler / İçerik / Repo.
  "content-radar": "news-pool",
  "repo-radar": "news-pool",
};

/** Folded/legacy sekme id → host + alt-görünüm (deep-link seeding için). */
export function seedTargetForTab(tabId: string): { host: string; view?: string } {
  const map: Record<string, { host: string; view: string }> = {
    "prompt-kutuphanesi": { host: "library", view: "prompts" },
    "pattern-library": { host: "library", view: "patterns" },
    patterns: { host: "library", view: "patterns" },
    "content-radar": { host: "news-pool", view: "content" },
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
  for (const group of NAV_GROUPS) {
    if (group.tabs.some((tab) => tab.id === id)) return group.id;
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Birincil alan katmanı (sol sidebar IA) — additive projeksiyon.
 *
 * Mevcut DIRECT_TABS + NAV_GROUPS dokunulmadan, aynı sekme id'leri 5 kullanıcı
 * alanına yeniden gruplanır. Yeni id YOK → store migration YOK; `activeTab`
 * tek persist edilen kaynak kalır, alan ondan türetilir (resolveAreaForTab).
 * ──────────────────────────────────────────────────────────────────────── */

export type PrimaryAreaId = "bugun" | "uret" | "kesfet" | "ogren" | "sosyal-medya";

export type PrimaryArea = {
  readonly id: PrimaryAreaId;
  readonly label: string;
  /** lucide-react ikon adı. */
  readonly icon: string;
  readonly tabIds: readonly string[];
};

export const PRIMARY_AREAS: readonly PrimaryArea[] = [
  { id: "bugun", label: "Bugün", icon: "Sunrise", tabIds: ["morning"] },
  {
    id: "uret",
    label: "Üret",
    icon: "PenLine",
    tabIds: ["daily-queue", "toolbox", "library"],
  },
  {
    id: "kesfet",
    label: "Keşfet",
    icon: "Compass",
    tabIds: ["discovery-engine", "flow-radar", "news-pool", "content-intel"],
  },
  {
    id: "ogren",
    label: "Öğren",
    icon: "GraduationCap",
    // CemOS Learn (learn-dashboard) yalnız NEXT_PUBLIC_LEARN_ENABLED=true iken görünür
    // (build-time inline). Kapalıyken Öğren alanı dokunulmadan kalır.
    tabIds: [
      "training-center",
      "source-intelligence",
      "weekly-learning-report",
      ...(process.env.NEXT_PUBLIC_LEARN_ENABLED === "true" ? ["learn-dashboard"] : []),
    ],
  },
  {
    id: "sosyal-medya",
    label: "Sosyal Medya",
    icon: "Share2",
    tabIds: ["instagram", "youtube"],
  },
];

/* ──────────────────────────────────────────────────────────────────────────
 * Yardımcı (utility) sekmeler — birincil alanların DIŞINDA, sol sidebar
 * footer'ında ayrı bir ikon kümesi olarak yaşar (Maliyet / Ayarlar / AI Sıralama).
 * resolveAreaForTab bunlar için null döner (kasıtlı); shell isUtilityTab ile ele alır.
 * ──────────────────────────────────────────────────────────────────────── */

export type UtilityTab = {
  readonly id: string;
  readonly label: string;
  /** lucide-react ikon adı. */
  readonly icon: string;
};

export const UTILITY_TABS: readonly UtilityTab[] = [
  { id: "costs", label: "Maliyetler", icon: "DollarSign" },
  { id: "settings", label: "Ayarlar", icon: "Settings" },
  { id: "ai-rankings", label: "AI Sıralama", icon: "BarChart3" },
];

/** Sekme yardımcı kümeye mi ait? (alias normalize edilir) */
export function isUtilityTab(tabId: string): boolean {
  const id = normalizeTabId(tabId);
  return UTILITY_TABS.some((t) => t.id === id);
}

/** Tüm sekmelerin id→label sözlüğü (DIRECT_TABS + NAV_GROUPS tek kaynak). */
const TAB_LABELS: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const tab of DIRECT_TABS) map[tab.id] = tab.label;
  for (const group of NAV_GROUPS) {
    for (const tab of group.tabs) map[tab.id] = tab.label;
  }
  // CemOS Learn — NAV_GROUPS dışında yaşar (Öğren alanına projekte edilir).
  map["learn-dashboard"] = "CemOS Learn";
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
