"use client";

import { normalizeTabId } from "@/components/nav/navConfig";
import FlowRadarTab from "@/components/tabs/FlowRadarTab";
import CostsTab from "@/components/tabs/CostsTab";
import SettingsTab from "@/components/tabs/SettingsTab";
import SourceIntelligenceTab from "@/components/tabs/SourceIntelligenceTab";
import DailyQueueTab from "@/components/tabs/DailyQueueTab";
import DiscoveryEngineTab from "@/components/tabs/DiscoveryEngineTab";
import MorningDashboardTab from "@/components/tabs/MorningDashboardTab";
import RadarTab from "@/components/tabs/RadarTab";
import ToolboxTab from "@/components/tabs/ToolboxTab";
import YouTubeTab from "@/components/tabs/YouTubeTab";
import LearnDashboardTab from "@/components/tabs/LearnDashboardTab";
import ViralLibraryTab from "@/components/tabs/ViralLibraryTab";
import PromptKutuphanesiTab from "@/components/tabs/PromptKutuphanesiTab";
import PatternLibraryTab from "@/components/tabs/PatternLibraryTab";
import KeywordLibraryTab from "@/components/tabs/KeywordLibraryTab";

/**
 * Maps a (possibly legacy-aliased) activeTab id to its screen component.
 * Shared by the app shell and the standalone /dashboard/* routes.
 *
 * IA v2: `news-pool` = Haberler host (Haberler/Repo); Kütüphane host dağıldı —
 * viral-library (Twitter) + prompt-library/pattern-library/keyword-library
 * (Kütüphane) bağımsız ekranlar. Kaldırılan sekmeler (instagram, ai-rankings,
 * training-center, weekly-learning-report, content-intel) TAB_ALIASES ile
 * canlı ekranlara normalize edilir → ayrı case'leri yok.
 */
export function renderScreen(activeTab: string): React.ReactNode {
  const id = normalizeTabId(activeTab);
  switch (id) {
    case "morning":
      return <MorningDashboardTab />;
    case "daily-queue":
      return <DailyQueueTab />;
    case "news-pool":
      return <RadarTab />;
    case "flow-radar":
      return <FlowRadarTab />;
    case "discovery-engine":
      return <DiscoveryEngineTab />;
    case "source-intelligence":
      return <SourceIntelligenceTab />;
    case "viral-library":
      return <ViralLibraryTab />;
    case "keyword-library":
      return <KeywordLibraryTab />;
    case "prompt-library":
      return <PromptKutuphanesiTab />;
    case "pattern-library":
      return <PatternLibraryTab />;
    case "youtube":
      return <YouTubeTab />;
    case "learn-dashboard":
      return <LearnDashboardTab />;
    case "toolbox":
      return <ToolboxTab />;
    case "costs":
      return <CostsTab />;
    case "settings":
      return <SettingsTab />;
    default:
      return <MorningDashboardTab />;
  }
}
