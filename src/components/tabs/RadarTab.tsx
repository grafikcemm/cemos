"use client";

import { useXAgentStore } from "@/store/xagent";
import { SubNav } from "@/components/ui";
import NewsPoolTab from "./NewsPoolTab";
import ContentRadarTab from "./ContentRadarTab";
import RepoRadarTab from "./RepoRadarTab";

const VIEWS = [
  { id: "news", label: "Haberler" },
  { id: "content", label: "İçerik" },
  { id: "repo", label: "Repo" },
];

/**
 * Radar host — Keşfet'in üç dış-kaynak besleme sayfasını (Haber/İçerik/Repo)
 * tek sekme + üst SubNav altında birleştirir. Alt-görünüm `radarView` ile persist edilir.
 * Alt sayfalar kendi başlıklarını korur (host yalnız sekme şeridini ekler).
 */
export default function RadarTab() {
  const radarView = useXAgentStore((s) => s.radarView);
  const setRadarView = useXAgentStore((s) => s.setRadarView);
  const view = VIEWS.some((v) => v.id === radarView) ? radarView : "news";

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <SubNav items={VIEWS} activeId={view} onSelect={setRadarView} />
      {view === "news" && <NewsPoolTab />}
      {view === "content" && <ContentRadarTab />}
      {view === "repo" && <RepoRadarTab />}
    </div>
  );
}
