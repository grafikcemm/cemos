"use client";

import { normalizeTabId } from "@/components/nav/navConfig";
import FlowRadarTab from "@/components/tabs/FlowRadarTab";
import CostsTab from "@/components/tabs/CostsTab";
import SettingsTab from "@/components/tabs/SettingsTab";
import LibraryTab from "@/components/tabs/LibraryTab";
import TrainingCenterTab from "@/components/tabs/TrainingCenterTab";
import PatternLibraryTab from "@/components/tabs/PatternLibraryTab";
import SourceIntelligenceTab from "@/components/tabs/SourceIntelligenceTab";
import DailyQueueTab from "@/components/tabs/DailyQueueTab";
import WeeklyLearningReportTab from "@/components/tabs/WeeklyLearningReportTab";
import DiscoveryEngineTab from "@/components/tabs/DiscoveryEngineTab";
import MorningDashboardTab from "@/components/tabs/MorningDashboardTab";
import NewsPoolTab from "@/components/tabs/NewsPoolTab";
import ContentRadarTab from "@/components/tabs/ContentRadarTab";
import RepoRadarTab from "@/components/tabs/RepoRadarTab";
import ToolboxTab from "@/components/tabs/ToolboxTab";
import PromptKutuphanesiTab from "@/components/tabs/PromptKutuphanesiTab";
import AiRankingsTab from "@/components/tabs/AiRankingsTab";
import YouTubeTab from "@/components/tabs/YouTubeTab";
import InstagramTab from "@/components/tabs/InstagramTab";

/**
 * Maps a (possibly legacy-aliased) activeTab id to its screen component.
 * Shared by the app shell and the standalone /dashboard/* routes so the
 * 20-way switch lives in exactly one place.
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
    case "pattern-library":
      return <PatternLibraryTab />;
    case "news-pool":
      return <NewsPoolTab />;
    case "content-radar":
      return <ContentRadarTab />;
    case "repo-radar":
      return <RepoRadarTab />;
    case "ai-rankings":
      return <AiRankingsTab />;
    case "toolbox":
      return <ToolboxTab />;
    case "prompt-kutuphanesi":
      return <PromptKutuphanesiTab />;
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
    default:
      return <MorningDashboardTab />;
  }
}
