import type { AccountHandle } from "@/lib/accounts";

export type WatchedSource = {
  handle: string;
  thresholdLikes: number;
  mode: string;
};

export const WATCHED_SOURCES: Record<AccountHandle, WatchedSource[]> = {
  grafikcem: [
    // TR-stickiness ÖNCE: Türk tasarım/AI/founder/build-in-public sesleri (ilk-N taranır → TR gündemi öne).
    { handle: "webrazzi", thresholdLikes: 20, mode: "tool_spotlight" },
    { handle: "ozansihay", thresholdLikes: 20, mode: "tool_spotlight" },
    { handle: "oguzhankazan", thresholdLikes: 20, mode: "hot_take" },
    { handle: "ShiftDeleteNet", thresholdLikes: 20, mode: "tool_spotlight" },
    { handle: "vibeeval", thresholdLikes: 20, mode: "thread" },
    { handle: "mervebo", thresholdLikes: 20, mode: "repo_kaynak" },
    // Uluslararası AI / tech referansı (global haberi TR iş akışına indirmek için)
    { handle: "rowancheung", thresholdLikes: 100, mode: "tool_spotlight" },
    { handle: "TheRundownAI", thresholdLikes: 100, mode: "tool_spotlight" },
    { handle: "emollick", thresholdLikes: 100, mode: "hot_take" },
    { handle: "sama", thresholdLikes: 100, mode: "hot_take" },
  ],
  maskulenkod: [
    // HİBRİT: ana eksen disiplin/sistem/sosyal güç; cinsiyet-realizmi dengeli yan eksen.
    // İlk-N TR-stickiness + sistem/disiplin ağırlıklı; redpill (bayredpill) kapağın altına alındı (ton dengesi).
    { handle: "maskuleninsan", thresholdLikes: 80, mode: "sosyal_gozlem" },
    { handle: "naval", thresholdLikes: 400, mode: "sistem_analizi" },
    { handle: "JamesClear", thresholdLikes: 400, mode: "disiplin_notu" },
    { handle: "JockoWillink", thresholdLikes: 200, mode: "disiplin_notu" },
    { handle: "erkekadamblogu", thresholdLikes: 40, mode: "sosyal_gozlem" },
    { handle: "turuksoz", thresholdLikes: 80, mode: "sosyal_gozlem" },
    // Kapağın altı: cinsiyet-realizmi kaynakları — yüksek eşik, denge generation forbidden ile korunur.
    { handle: "testereakademi", thresholdLikes: 250, mode: "hot_take" },
    { handle: "bayredpill", thresholdLikes: 300, mode: "hot_take" },
  ],

};
