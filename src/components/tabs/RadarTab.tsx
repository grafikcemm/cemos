"use client";

import { useXAgentStore } from "@/store/xagent";
import { SubNav } from "@/components/ui";
import NewsPoolTab from "./NewsPoolTab";
import RepoRadarTab from "./RepoRadarTab";

const VIEWS = [
  { id: "news", label: "Haberler" },
  { id: "repo", label: "Repo" },
];

/**
 * Haberler host — günlük haber akışı + GitHub trend repoları tek sekme + üst
 * SubNav altında. Alt-görünüm `radarView` ile persist edilir; kaldırılan
 * "content" görünümü okuma anında "news"e normalize edilir (IA v2).
 */
export default function RadarTab() {
  const radarView = useXAgentStore((s) => s.radarView);
  const setRadarView = useXAgentStore((s) => s.setRadarView);
  const view = VIEWS.some((v) => v.id === radarView) ? radarView : "news";

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <SubNav items={VIEWS} activeId={view} onSelect={setRadarView} />
      {view === "news" && <NewsPoolTab />}
      {view === "repo" && <RepoRadarTab />}
    </div>
  );
}
