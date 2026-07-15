"use client";

import { normalizeTabId } from "@/components/nav/navConfig";
import MorningDashboardTab from "@/components/tabs/MorningDashboardTab";
import RadarTab from "@/components/tabs/RadarTab";
import FlowRadarTab from "@/components/tabs/FlowRadarTab";
import DiscoveryEngineTab from "@/components/tabs/DiscoveryEngineTab";
import SourceIntelligenceTab from "@/components/tabs/SourceIntelligenceTab";
import YouTubeTab from "@/components/tabs/YouTubeTab";
import ToolboxTab from "@/components/tabs/ToolboxTab";
import CostsTab from "@/components/tabs/CostsTab";
import SystemTab from "@/components/tabs/SystemTab";
import SettingsTab from "@/components/tabs/SettingsTab";
import TakvimTab from "@/components/plan/TakvimTab";
import FirsatlarTab from "@/components/plan/FirsatlarTab";
import SerilerTab from "@/components/plan/SerilerTab";
import LibTumuTab from "@/components/library/LibTumuTab";
import LibIlhamTab from "@/components/library/LibIlhamTab";
import LibOgrenmeTab from "@/components/library/LibOgrenmeTab";
import ProfileMemoryTab from "@/components/profile/ProfileMemoryTab";
import ProfileIntegrationsTab from "@/components/profile/ProfileIntegrationsTab";

/**
 * (Alias normalize edilmiş) activeTab id → ekran bileşeni. Shell + standalone
 * /dashboard/* rotaları paylaşır.
 *
 * IA (rebuild): 3 birincil alan host'ları + 5 REDESIGNED-ADVANCED araştırma
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
      return <FlowRadarTab />;
    case "discovery-engine":
      return <DiscoveryEngineTab />;
    case "source-intelligence":
      return <SourceIntelligenceTab />;
    // ── Toolbox (utility) ──
    case "toolbox":
      return <ToolboxTab />;
    // ── Profil yüzeyleri ──
    case "profile-memory":
      return <ProfileMemoryTab />;
    case "profile-integrations":
      return <ProfileIntegrationsTab />;
    case "system":
      return <SystemTab />;
    case "costs":
      return <CostsTab />;
    case "settings":
      return <SettingsTab />;
    default:
      return <MorningDashboardTab />;
  }
}
