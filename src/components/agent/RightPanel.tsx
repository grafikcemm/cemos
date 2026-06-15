"use client";

import ScanSettings from "./ScanSettings";
import AutomationToggle from "./AutomationToggle";
import WatchedSources from "./WatchedSources";

export default function RightPanel() {
  return (
    <div style={{
      width: 280, flexShrink: 0,
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden", alignSelf: "flex-start",
    }}>
      <ScanSettings />
      <AutomationToggle />
      <WatchedSources />
    </div>
  );
}
