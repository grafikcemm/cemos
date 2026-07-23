"use client";

import { normalizeTabId } from "@/components/nav/navConfig";
import MorningDashboardTab from "@/components/tabs/MorningDashboardTab";
import RadarTab from "@/components/tabs/RadarTab";
import ViralRadarScreen from "@/components/research/ViralRadarScreen";
import SourceIntelScreen from "@/components/research/SourceIntelScreen";
import YouTubeTab from "@/components/tabs/YouTubeTab";
import ToolboxTab from "@/components/tabs/ToolboxTab";
import SystemTab from "@/components/tabs/SystemTab";
import SettingsTab from "@/components/tabs/SettingsTab";
import TakvimTab from "@/components/plan/TakvimTab";
import FirsatlarTab from "@/components/plan/FirsatlarTab";
import SerilerTab from "@/components/plan/SerilerTab";
import LibTumuTab from "@/components/library/LibTumuTab";
import LibIlhamTab from "@/components/library/LibIlhamTab";
import LibOgrenmeTab from "@/components/library/LibOgrenmeTab";
import ProfileMemoryTab from "@/components/profile/ProfileMemoryTab";

/**
 * (Alias normalize edilmiş) activeTab id → ekran bileşeni. Shell + standalone
 * /dashboard/* rotaları paylaşır.
 *
 * IA 15+3 (2026-07-23): 3 birincil alan host'ları + 4 REDESIGNED-ADVANCED araştırma
 * ekranı + Toolbox (utility) + Profil yüzeyleri. ABSORBED ekranlar (daily-queue,
 * viral/keyword/prompt/pattern-library, learn-dashboard, instagram) TAB_ALIASES
 * ile yeni evlerine normalize edilir → ayrı case'leri yok. Yeni host'ların tam
 * kompozisyonu Faz 1D (şimdilik dürüst placeholder).
 */
export function renderScreen(activeTab: string): React.ReactNode {
  const id = normalizeTabId(activeTab);
  switch (id) {
    // ── Bugün ──
    case "morning":
      return <MorningDashboardTab />;
    // ── Plan ──
    case "plan-takvim":
      return <TakvimTab />;
    case "plan-firsatlar":
      return <FirsatlarTab />;
    case "plan-seriler":
      return <SerilerTab />;
    // ── Kütüphane ──
    case "lib-tumu":
      return <LibTumuTab />;
    case "lib-ilham":
      return <LibIlhamTab />;
    case "lib-ogrenme":
      return <LibOgrenmeTab />;
    // ── REDESIGNED-ADVANCED (araştırma detayı) ──
    case "news-pool":
      return <RadarTab />;
    case "youtube":
      return <YouTubeTab />;
    case "flow-radar":
      return <ViralRadarScreen />;
    case "source-intelligence":
      return <SourceIntelScreen />;
    // ── Toolbox (utility) ──
    case "toolbox":
      return <ToolboxTab />;
    // ── Profil yüzeyleri ──
    case "profile-memory":
      return <ProfileMemoryTab />;
    case "system":
      return <SystemTab />;
    case "settings":
      return <SettingsTab />;
    default:
      return <MorningDashboardTab />;
  }
}
