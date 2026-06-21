"use client";

import { normalizeTabId } from "@/components/nav/navConfig";
import FlowRadarTab from "@/components/tabs/FlowRadarTab";
import CostsTab from "@/components/tabs/CostsTab";
import SettingsTab from "@/components/tabs/SettingsTab";
import LibraryTab from "@/components/tabs/LibraryTab";
import TrainingCenterTab from "@/components/tabs/TrainingCenterTab";
import SourceIntelligenceTab from "@/components/tabs/SourceIntelligenceTab";
import DailyQueueTab from "@/components/tabs/DailyQueueTab";
import WeeklyLearningReportTab from "@/components/tabs/WeeklyLearningReportTab";
import DiscoveryEngineTab from "@/components/tabs/DiscoveryEngineTab";
import MorningDashboardTab from "@/components/tabs/MorningDashboardTab";
import RadarTab from "@/components/tabs/RadarTab";
import ToolboxTab from "@/components/tabs/ToolboxTab";
import AiRankingsTab from "@/components/tabs/AiRankingsTab";
import YouTubeTab from "@/components/tabs/YouTubeTab";
import InstagramTab from "@/components/tabs/InstagramTab";
import LearnDashboardTab from "@/components/tabs/LearnDashboardTab";

/**
 * Maps a (possibly legacy-aliased) activeTab id to its screen component.
 * Shared by the app shell and the standalone /dashboard/* routes.
 *
 * Agresif birleştirme: `library` = Kütüphane host (Tweetler/Promptlar/Patternler),
 * `news-pool` = Radar host (Haberler/İçerik/Repo). Folded id'ler TAB_ALIASES ile
 * host'a normalize edilir → ayrı case'leri yok.
 */
export function renderScreen(activeTab: string): React.ReactNode {
  const id = normalizeTabId(activeTab);
  switch (id) {
    case "morning":
      return <MorningDashboardTab />;
    case "discovery-engine":
      return <DiscoveryEngineTab />;
    case "daily-queue":
      return <DailyQueueTab />;
    case "flow-radar":
      return <FlowRadarTab />;
    case "source-intelligence":
      return <SourceIntelligenceTab />;
    case "news-pool":
      return <RadarTab />;
    case "ai-rankings":
      return <AiRankingsTab />;
    case "toolbox":
      return <ToolboxTab />;
    case "library":
      return <LibraryTab />;
    case "costs":
      return <CostsTab />;
    case "settings":
      return <SettingsTab />;
    case "weekly-learning-report":
      return <WeeklyLearningReportTab />;
    case "training-center":
      return <TrainingCenterTab />;
    case "instagram":
      return <InstagramTab />;
    case "youtube":
      return <YouTubeTab />;
    case "learn-dashboard":
      return <LearnDashboardTab />;
    default:
      return <MorningDashboardTab />;
  }
}
