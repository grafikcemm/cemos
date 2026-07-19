/**
 * CemOS nav yapılandırması — tek doğruluk kaynağı.
 * Saf TS: React yok; Sidebar, AppShell, ProfileMenu, MobileNav, CommandPalette,
 * vitest ve e2e helper aynı modülü kullanır.
 *
 * IA (rebuild, 2026-07): üç göreve indirgenmiş ana navigasyon —
 * **Bugün · Plan · Kütüphane** + Toolbox (utility) + Profil (menü). Utility ve
 * ayar yüzeyleri ana rail'de DEĞİL; Profil menüsünde toplanır (05 §A6).
 *
 * İki ekran sınıfı (04 planı):
 *  - ABSORBED: eski ekran kullanıcı erişiminden çıkar, id'si yeni eve alias'lanır
 *    (`daily-queue`→morning, `viral-library`…→lib-tumu, `instagram`→plan-seriler…).
 *  - REDESIGNED-ADVANCED: `news-pool`/`youtube`/`flow-radar`/`discovery-engine`/
 *    `source-intelligence` — Fırsatlar araştırma detayı; **alias'lanMAZ**, canlı
 *    id olarak kalır, store v9 migration bunlara dokunmaz.
 *
 * Legacy invariant: localStorage anahtarı "xagent-store" değişmez.
 */

export type NavTab = { readonly id: string; readonly label: string };

/** Üç birincil görev alanı. */
export type PrimaryAreaId = "bugun" | "plan" | "kutuphane";

export type PrimaryArea = {
  readonly id: PrimaryAreaId;
  readonly label: string;
  /** lucide-react ikon adı. */
  readonly icon: string;
  /** Alanın alt-sekmeleri (tek sekmeli alan alt-nav göstermez). */
  readonly tabIds: readonly string[];
};

export const PRIMARY_AREAS: readonly PrimaryArea[] = [
  { id: "bugun", label: "Bugün", icon: "Sunrise", tabIds: ["morning"] },
  {
    id: "plan",
    label: "Plan",
    icon: "CalendarRange",
    tabIds: ["plan-takvim", "plan-firsatlar", "plan-seriler"],
  },
  {
    id: "kutuphane",
    label: "Kütüphane",
    icon: "Library",
    tabIds: ["lib-tumu", "lib-ilham", "lib-ogrenme"],
  },
];

/**
 * REDESIGNED-ADVANCED araştırma ekranları — ana nav DIŞINDA. Fırsatlar'dan ve
 * Cmd+K'dan açılır; sidebar highlight'ı için `parentArea`ya (Plan) bağlanır.
 * id'ler CANLI ve SABİT — alias'lanmaz, migration'da değişmez.
 */
export type AdvancedTab = {
  readonly id: string;
  readonly label: string;
  readonly parentArea: PrimaryAreaId;
};

export const ADVANCED_TABS: readonly AdvancedTab[] = [
  { id: "news-pool", label: "Haber Havuzu", parentArea: "plan" },
  { id: "youtube", label: "YouTube Fırsat Motoru", parentArea: "plan" },
  { id: "flow-radar", label: "Viral Radar", parentArea: "plan" },
  { id: "discovery-engine", label: "Keşif Motoru", parentArea: "plan" },
  { id: "source-intelligence", label: "X Hesabı Kaynakları", parentArea: "plan" },
];

/**
 * ADR-040: "Araştırma" sidebar grubu — SUNUM katmanı, sınıflandırma DEĞİL. Bu
 * ekranlar hâlâ REDESIGNED-ADVANCED'tir (resolveAreaForTab → null, parentArea
 * "plan" highlight için), ama artık ana rail'de kendi hiyerarşik grubunda
 * keşfedilebilir (yalnız Fırsatlar/Cmd+K arkasında saklı değil). Kısa etiket +
 * lucide ikon; ADVANCED_TABS tek kaynaktır (bu yalnız ikon + kısa ad ekler).
 */
export const RESEARCH_ICONS: Readonly<Record<string, string>> = {
  "news-pool": "Newspaper",
  youtube: "MonitorPlay",
  "flow-radar": "Flame",
  "discovery-engine": "Telescope",
  "source-intelligence": "AtSign",
};

/** Sidebar "Araştırma" grubu için kısa etiketler (uzun ADVANCED_TABS etiketleri
 *  dar rail'de taşar). id → kısa ad; etiket YİNE tek-kaynak labelForTab'ten türer
 *  değilse fallback tam etiket. */
const RESEARCH_SHORT_LABELS: Readonly<Record<string, string>> = {
  "news-pool": "Haberler",
  youtube: "YouTube",
  "flow-radar": "Viral Radar",
  "discovery-engine": "Keşif",
  "source-intelligence": "X Kaynakları",
};

export type ResearchNavItem = { readonly id: string; readonly label: string; readonly icon: string };

/**
 * Sidebar "Araştırma" grubu öğeleri (id + kısa etiket + lucide ikon adı).
 * ADVANCED_TABS sırasını korur; tek kaynak. Sınıflandırmayı DEĞİŞTİRMEZ.
 */
export function researchNavItems(): ResearchNavItem[] {
  return ADVANCED_TABS.map((t) => ({
    id: t.id,
    label: RESEARCH_SHORT_LABELS[t.id] ?? t.label,
    icon: RESEARCH_ICONS[t.id] ?? "Compass",
  }));
}

/** Yardımcı (utility) — ana alanlar altında ayrı, küçük. Yalnız Toolbox. */
export type UtilityTab = { readonly id: string; readonly label: string; readonly icon: string };

export const UTILITY_TABS: readonly UtilityTab[] = [
  { id: "toolbox", label: "Toolbox", icon: "Wrench" },
];

/** Profil menüsü yüzeyleri (05 §A6) — utility/system/settings buraya taşındı. */
export type ProfileTab = { readonly id: string; readonly label: string; readonly icon: string };

export const PROFILE_TABS: readonly ProfileTab[] = [
  { id: "profile-memory", label: "CemOS'un bildikleri", icon: "Brain" },
  { id: "profile-integrations", label: "Entegrasyonlar", icon: "Plug" },
  { id: "system", label: "Sistem", icon: "Activity" },
  { id: "costs", label: "Maliyet", icon: "DollarSign" },
  { id: "settings", label: "Ayarlar", icon: "Settings" },
];

/**
 * Eski ALAN id'leri → yeni alan (savunmacı: persist edilmiş/deep-link alan
 * referansları için). activeTab TAB id taşır, ALAN id değil — bu yüzden pratikte
 * yalnız ileri-uyumluluk; testle sabitlenir.
 */
export const AREA_ALIASES: Readonly<Record<string, PrimaryAreaId>> = {
  uretim: "plan",
  kesif: "plan",
  hafiza: "kutuphane",
};

/**
 * Persist edilmiş/deep-link legacy activeTab → canlı ekran. ABSORBED ekranlar
 * yeni evlerine, eski deep-link id'leri güncel hedeflerine iner. Alias
 * ANAHTARLARI asla canlı bir tab id'sini gölgeleyemez (test garantisi).
 * REDESIGNED-ADVANCED id'leri (news-pool/youtube/flow-radar/discovery-engine/
 * source-intelligence) burada HEDEF olabilir ama ANAHTAR değildir → dokunulmaz.
 */
export const TAB_ALIASES: Readonly<Record<string, string>> = {
  // ── ABSORBED (rebuild v9): eski ekranlar yeni evlerine ──
  "daily-queue": "morning",
  "viral-library": "lib-tumu",
  "keyword-library": "lib-tumu",
  "prompt-library": "lib-tumu",
  "pattern-library": "lib-tumu",
  "learn-dashboard": "lib-ogrenme",
  instagram: "plan-seriler",
  // ── Eski deep-link / kaldırılmış id'ler ──
  flow: "flow-radar",
  queue: "morning", // eski daily-queue absorbe edildi
  sources: "source-intelligence",
  library: "lib-tumu",
  patterns: "lib-tumu",
  "prompt-kutuphanesi": "lib-tumu",
  "content-radar": "news-pool",
  "repo-radar": "news-pool",
  "content-intel": "discovery-engine",
  "ai-rankings": "toolbox",
  "weekly-learning-report": "morning",
  // ADR-045: Eğitim Merkezi'nin geri bildirim/öğrenme geçmişi Profil → CemOS'un
  // bildikleri'ne birleşti (yanlış "morning" alias'ı düzeltildi).
  "training-center": "profile-memory",
};

/** Tüm gezilebilir sekmelerin id→etiket sözlüğü (tek kaynak). */
const TAB_LABELS: Readonly<Record<string, string>> = {
  morning: "Bugün",
  "plan-takvim": "Takvim",
  "plan-firsatlar": "Fırsatlar",
  "plan-seriler": "Seriler",
  "lib-tumu": "Tümü",
  "lib-ilham": "İlham",
  "lib-ogrenme": "Öğrenme",
  "news-pool": "Haber Havuzu",
  youtube: "YouTube Fırsat Motoru",
  "flow-radar": "Viral Radar",
  "discovery-engine": "Keşif Motoru",
  "source-intelligence": "X Hesabı Kaynakları",
  toolbox: "Toolbox",
  "profile-memory": "CemOS'un bildikleri",
  "profile-integrations": "Entegrasyonlar",
  system: "Sistem",
  costs: "Maliyet",
  settings: "Ayarlar",
};

export function normalizeTabId(tabId: string): string {
  return TAB_ALIASES[tabId] ?? tabId;
}

export function normalizeAreaId(areaId: string): string {
  return AREA_ALIASES[areaId] ?? areaId;
}

/** Sekmenin (alias normalize edilmiş) insan-okur etiketi. */
export function labelForTab(tabId: string): string {
  const id = normalizeTabId(tabId);
  return TAB_LABELS[id] ?? id;
}

/** Sekmenin ait olduğu birincil alan; advanced/utility/profile/bilinmeyen → null. */
export function resolveAreaForTab(tabId: string): PrimaryAreaId | null {
  const id = normalizeTabId(tabId);
  for (const area of PRIMARY_AREAS) {
    if (area.tabIds.includes(id)) return area.id;
  }
  return null;
}

/** Advanced araştırma ekranı mı? */
export function isAdvancedTab(tabId: string): boolean {
  const id = normalizeTabId(tabId);
  return ADVANCED_TABS.some((t) => t.id === id);
}

export function advancedMeta(tabId: string): AdvancedTab | null {
  const id = normalizeTabId(tabId);
  return ADVANCED_TABS.find((t) => t.id === id) ?? null;
}

/** Sekme yardımcı kümeye (Toolbox) mi ait? */
export function isUtilityTab(tabId: string): boolean {
  const id = normalizeTabId(tabId);
  return UTILITY_TABS.some((t) => t.id === id);
}

/** Sekme Profil yüzeyi mi? */
export function isProfileTab(tabId: string): boolean {
  const id = normalizeTabId(tabId);
  return PROFILE_TABS.some((t) => t.id === id);
}

export function profileMeta(tabId: string): ProfileTab | null {
  const id = normalizeTabId(tabId);
  return PROFILE_TABS.find((t) => t.id === id) ?? null;
}

/**
 * Sidebar'da hangi birincil alanın yanacağı: birincil sekme → kendi alanı;
 * advanced ekran → araştırma ebeveyni (Plan); utility/profile → null.
 */
export function highlightAreaForTab(tabId: string): PrimaryAreaId | null {
  const primary = resolveAreaForTab(tabId);
  if (primary) return primary;
  return advancedMeta(tabId)?.parentArea ?? null;
}

/** Alanın ilk (varsayılan) sekme id'si. */
export function firstTabOfArea(areaId: PrimaryAreaId): string {
  const area = PRIMARY_AREAS.find((a) => a.id === areaId);
  return area ? area.tabIds[0] : "morning";
}

/** Alanın alt-sekmeleri (SubNav için), etiketler tek-kaynaktan. */
export function subTabsOfArea(areaId: PrimaryAreaId): { id: string; label: string }[] {
  const area = PRIMARY_AREAS.find((a) => a.id === areaId);
  if (!area) return [];
  return area.tabIds.map((id) => ({ id, label: labelForTab(id) }));
}

/** Folded/legacy deep-link id → host + alt-görünüm (standalone route seeding). */
export function seedTargetForTab(tabId: string): { host: string; view?: string } {
  const map: Record<string, { host: string; view: string }> = {
    "content-radar": { host: "news-pool", view: "news" },
    "repo-radar": { host: "news-pool", view: "repo" },
  };
  return map[tabId] ?? { host: normalizeTabId(tabId) };
}

/**
 * Komut paleti (Cmd/Ctrl-K) için gezilebilir tüm sekmeler — grup etiketiyle.
 * Birincil alanlar + advanced araştırma + Toolbox + Profil yüzeyleri.
 */
export function allNavigableTabs(): { id: string; label: string; group: string }[] {
  const out: { id: string; label: string; group: string }[] = [];
  for (const area of PRIMARY_AREAS) {
    for (const id of area.tabIds) {
      out.push({ id, label: labelForTab(id), group: area.label });
    }
  }
  for (const t of ADVANCED_TABS) out.push({ id: t.id, label: t.label, group: "Araştırma" });
  for (const t of UTILITY_TABS) out.push({ id: t.id, label: t.label, group: "Toolbox" });
  for (const t of PROFILE_TABS) out.push({ id: t.id, label: t.label, group: "Profil" });
  return out;
}
