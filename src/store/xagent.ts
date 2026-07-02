import { create } from "zustand";
import { persist } from "zustand/middleware";
import { XAGENT_STORE_VERSION, migrateXAgentStore } from "./migrations";

/* ── Types ──────────────────────────────────────────── */

export type Channel = "grafikcem" | "maskulenkod";
export type DraftType = "TWEET" | "QUOTE" | "REPLY";
export type QueueStatus = "new" | "approved" | "scheduled" | "published" | "rejected";
export type SourceMode = "ALL" | "TWEET" | "QUOTE" | "REPLY";

export interface FlowTweet {
  id: string;
  handle: string;
  text: string;
  likeCount: number;
  retweetCount: number;
  viewCount: number;
  viralScore: number;
  url: string;
  source: string;
  mode: string;
  channel?: Channel;
  createdAt?: string;
  mediaUrl?: string;
  mediaType?: "photo" | "video" | "animated_gif";
}

export interface QueueItem {
  id: string;
  channel: Channel;
  draftType: DraftType;
  content: string;
  charCount: number;
  sourceTweet: string;
  sourceHandle: string;
  viralScore: number;
  status: QueueStatus;
  editedContent?: string;
  scheduledAt?: string;
  publishedAt?: string;
  createdAt: string;
}

export interface WatchedSourceItem {
  handle: string;
  displayName?: string;
  enabled: boolean;
  mode: SourceMode;
  thresholdLikes: number;
  thresholdRetweets: number;
  channel: Channel;
}

export interface PatternItem {
  id: string;
  name: string;
  hookText: string;
  type: string;
  createdAt: string;
}

export interface DailyCost {
  date: string;
  cost: number;
}

export interface NewsItem {
  id: string;
  channel: Channel;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  lang: "en" | "tr";
  fetchedAt: string;
}

/* ── Store Interface ────────────────────────────────── */

interface XAgentStore {
  // Aktif sekme
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Birleşik host alt-görünümleri (persist edilir — folded sekmeler buraya iner)
  libraryView: string; // "tweets" | "prompts" | "patterns"
  setLibraryView: (v: string) => void;
  radarView: string; // "news" | "content" | "repo"
  setRadarView: (v: string) => void;

  // Kanal
  activeChannel: Channel;
  setActiveChannel: (ch: Channel) => void;

  // Akış (ephemeral — persist edilmez)
  flowItems: FlowTweet[];
  setFlowItems: (items: FlowTweet[]) => void;
  addFlowItems: (items: FlowTweet[]) => void;
  removeFlowItem: (id: string) => void;
  clearFlowItemsByChannel: (channel: Channel) => void;

  // Kuyruk
  queueItems: QueueItem[];
  addQueueItem: (item: QueueItem) => void;
  updateQueueItem: (id: string, updates: Partial<QueueItem>) => void;
  removeQueueItem: (id: string) => void;

  // Kaynaklar
  watchedSources: WatchedSourceItem[];
  addWatchedSource: (source: WatchedSourceItem) => void;
  removeWatchedSource: (handle: string, channel: Channel) => void;
  updateWatchedSource: (handle: string, channel: Channel, updates: Partial<WatchedSourceItem>) => void;

  // Paternler
  patterns: PatternItem[];
  addPattern: (pattern: PatternItem) => void;
  removePattern: (id: string) => void;

  // Tarama
  isScanning: boolean;
  setIsScanning: (v: boolean) => void;
  scanStatus: string;
  setScanStatus: (s: string) => void;
  lastScanTime: string | null;
  setLastScanTime: (t: string | null) => void;

  // Üretim
  generatingId: string | null;
  setGeneratingId: (id: string | null) => void;

  // Ayarlar
  postsPerSource: number;
  setPostsPerSource: (n: number) => void;
  maxPostAge: number;
  setMaxPostAge: (n: number) => void;
  automationEnabled: boolean;
  setAutomationEnabled: (v: boolean) => void;
  scanIntervalHours: number;
  setScanIntervalHours: (n: number) => void;
  // "daily" = her gün, "monday" = sadece Pazartesi
  channelScanSchedule: Record<Channel, "daily" | "monday">;
  setChannelScanSchedule: (channel: Channel, schedule: "daily" | "monday") => void;
  lastChannelScanDate: Record<Channel, string | null>;
  setLastChannelScanDate: (channel: Channel, date: string) => void;

  // Haberler
  newsItems: NewsItem[];
  addNewsItems: (items: NewsItem[]) => void;
  removeNewsItem: (id: string) => void;
  clearNewsItems: (channel: Channel) => void;

  // Viral kütüphane
  savedTweets: FlowTweet[];
  saveTweet: (tweet: FlowTweet) => void;
  removeSavedTweet: (id: string) => void;

  // Maliyet takibi
  todayCost: number;
  addCost: (amount: number) => void;
  todayScanCount: number;
  todayGenerateCount: number;
  incrementScanCount: (n: number) => void;
  incrementGenerateCount: () => void;
  dailyCosts: DailyCost[];
  addDailyCost: (entry: DailyCost) => void;
  upsertDailyCost: (amount: number) => void;
  monthlyBudgetUSD: number;
  setMonthlyBudgetUSD: (n: number) => void;
  monthlyCost: number;
  addMonthlyCost: (amount: number) => void;
  monthlyResetDate: string;
}

/* ── Default Sources ────────────────────────────────── */

const defaultSources: WatchedSourceItem[] = [
  // ── grafikcem — Türkçe AI/tech/tasarım/girişim ──
  { handle: "ozansihay", enabled: true, mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "hrrcnes", enabled: true, mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "ozcnkrtn", enabled: true, mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "viktoroddy", enabled: true, mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "vibeeval", enabled: true, mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "Techburhan", displayName: "Techburhan", enabled: true, mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "kadiruludag", enabled: true, mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "buzzicra", enabled: true, mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  { handle: "Aykutuces", enabled: true, mode: "TWEET", thresholdLikes: 20, thresholdRetweets: 3, channel: "grafikcem" },
  // uluslararası referans
  { handle: "rowancheung", enabled: true, mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },
  { handle: "sama", displayName: "Sam Altman", enabled: true, mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "grafikcem" },

  // ── maskulenkod — Türkçe & uluslararası erkeklik/redpill ──
  { handle: "bayredpill", enabled: true, mode: "TWEET", thresholdLikes: 5, thresholdRetweets: 1, channel: "maskulenkod" },
  { handle: "enkijust", enabled: true, mode: "TWEET", thresholdLikes: 5, thresholdRetweets: 1, channel: "maskulenkod" },
  { handle: "klaus0035", enabled: true, mode: "TWEET", thresholdLikes: 5, thresholdRetweets: 1, channel: "maskulenkod" },
  { handle: "dirstream", enabled: true, mode: "TWEET", thresholdLikes: 5, thresholdRetweets: 1, channel: "maskulenkod" },
  { handle: "JohnnyDeLusion", enabled: true, mode: "TWEET", thresholdLikes: 5, thresholdRetweets: 1, channel: "maskulenkod" },
  // uluslararası referans
  { handle: "JockoWillink", enabled: true, mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "naval", displayName: "Naval", enabled: true, mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" },
  { handle: "AndyFrisella", enabled: true, mode: "TWEET", thresholdLikes: 100, thresholdRetweets: 20, channel: "maskulenkod" }
];

/* ── Store ──────────────────────────────────────────── */

export const useXAgentStore = create<XAgentStore>()(
  persist(
    (set) => ({
      // Tab
      activeTab: "morning",
      setActiveTab: (tab) => set({ activeTab: tab }),

      // Birleşik host alt-görünümleri
      libraryView: "tweets",
      setLibraryView: (v) => set({ libraryView: v }),
      radarView: "news",
      setRadarView: (v) => set({ radarView: v }),

      // Kanal
      activeChannel: "grafikcem",
      setActiveChannel: (ch) => set({ activeChannel: ch }),

      // Akış (ephemeral)
      flowItems: [],
      setFlowItems: (items) => set({ flowItems: items }),
      addFlowItems: (items) =>
        set((state) => {
          const existingIds = new Set(state.flowItems.map((t) => t.id));
          const newItems = items.filter((t) => !existingIds.has(t.id));
          return { flowItems: [...newItems, ...state.flowItems] };
        }),
      removeFlowItem: (id) =>
        set((state) => ({ flowItems: state.flowItems.filter((t) => t.id !== id) })),
      clearFlowItemsByChannel: (channel) =>
        set((state) => ({ flowItems: state.flowItems.filter((t) => t.channel !== channel) })),

      // Kuyruk
      queueItems: [],
      addQueueItem: (item) =>
        set((state) => ({ queueItems: [item, ...state.queueItems] })),
      updateQueueItem: (id, updates) =>
        set((state) => ({
          queueItems: state.queueItems.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          )
        })),
      removeQueueItem: (id) =>
        set((state) => ({ queueItems: state.queueItems.filter((item) => item.id !== id) })),

      // Kaynaklar
      watchedSources: defaultSources,
      addWatchedSource: (source) =>
        set((state) => ({ watchedSources: [...state.watchedSources, source] })),
      removeWatchedSource: (handle, channel) =>
        set((state) => ({
          watchedSources: state.watchedSources.filter(
            (s) => !(s.handle === handle && s.channel === channel)
          )
        })),
      updateWatchedSource: (handle, channel, updates) =>
        set((state) => ({
          watchedSources: state.watchedSources.map((s) =>
            s.handle === handle && s.channel === channel ? { ...s, ...updates } : s
          )
        })),

      // Paternler
      patterns: [
        { id: "p1", name: "Soru ile Aç", hookText: "Bunu biliyor muydun?", type: "hook", createdAt: new Date().toISOString() },
        { id: "p2", name: "Zıtlık Kur", hookText: "Herkes X yapıyor. Ama gerçek Y şöyle.", type: "contrast", createdAt: new Date().toISOString() },
        { id: "p3", name: "Veri ile Başla", hookText: "Son araştırmaya göre %X...", type: "data", createdAt: new Date().toISOString() },
        { id: "p4", name: "Kışkırt", hookText: "Kimse bunu söylemiyor ama...", type: "provoke", createdAt: new Date().toISOString() }
      ],
      addPattern: (pattern) =>
        set((state) => ({ patterns: [pattern, ...state.patterns] })),
      removePattern: (id) =>
        set((state) => ({ patterns: state.patterns.filter((p) => p.id !== id) })),

      // Tarama
      isScanning: false,
      setIsScanning: (v) => set({ isScanning: v }),
      scanStatus: "",
      setScanStatus: (s) => set({ scanStatus: s }),
      lastScanTime: null,
      setLastScanTime: (t) => set({ lastScanTime: t }),

      // Üretim
      generatingId: null,
      setGeneratingId: (id) => set({ generatingId: id }),

      // Ayarlar
      postsPerSource: 10,
      setPostsPerSource: (n) => set({ postsPerSource: n }),
      maxPostAge: 6,
      setMaxPostAge: (n) => set({ maxPostAge: n }),
      automationEnabled: false,
      setAutomationEnabled: (v) => set({ automationEnabled: v }),
      scanIntervalHours: 24,
      setScanIntervalHours: (n) => set({ scanIntervalHours: n }),
      channelScanSchedule: { grafikcem: "daily", maskulenkod: "monday"},
      setChannelScanSchedule: (channel, schedule) =>
        set((state) => ({ channelScanSchedule: { ...state.channelScanSchedule, [channel]: schedule } })),
      lastChannelScanDate: { grafikcem: null, maskulenkod: null },
      setLastChannelScanDate: (channel, date) =>
        set((state) => ({ lastChannelScanDate: { ...state.lastChannelScanDate, [channel]: date } })),

      // Haberler
      newsItems: [],
      addNewsItems: (items) =>
        set((state) => {
          const existingIds = new Set(state.newsItems.map((n) => n.id));
          const fresh = items.filter((n) => !existingIds.has(n.id));
          return { newsItems: [...fresh, ...state.newsItems].slice(0, 200) };
        }),
      removeNewsItem: (id) =>
        set((state) => ({ newsItems: state.newsItems.filter((n) => n.id !== id) })),
      clearNewsItems: (channel) =>
        set((state) => ({ newsItems: state.newsItems.filter((n) => n.channel !== channel) })),

      // Viral kütüphane
      savedTweets: [],
      saveTweet: (tweet) =>
        set((state) => {
          if (state.savedTweets.find((t) => t.id === tweet.id)) return state;
          return { savedTweets: [tweet, ...state.savedTweets].slice(0, 500) };
        }),
      removeSavedTweet: (id) =>
        set((state) => ({ savedTweets: state.savedTweets.filter((t) => t.id !== id) })),

      // Maliyet
      todayCost: 0,
      addCost: (amount) => set((state) => ({ todayCost: state.todayCost + amount })),
      todayScanCount: 0,
      todayGenerateCount: 0,
      incrementScanCount: (n) => set((state) => ({ todayScanCount: state.todayScanCount + n })),
      incrementGenerateCount: () => set((state) => ({ todayGenerateCount: state.todayGenerateCount + 1 })),
      dailyCosts: [],
      addDailyCost: (entry) =>
        set((state) => ({ dailyCosts: [...state.dailyCosts, entry] })),
      upsertDailyCost: (amount) =>
        set((state) => {
          const label = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
          const idx = state.dailyCosts.findIndex((e) => e.date === label);
          if (idx !== -1) {
            const updated = [...state.dailyCosts];
            updated[idx] = { date: label, cost: updated[idx].cost + amount };
            return { dailyCosts: updated };
          }
          return { dailyCosts: [...state.dailyCosts.slice(-6), { date: label, cost: amount }] };
        }),
      monthlyBudgetUSD: 6,
      setMonthlyBudgetUSD: (n) => set({ monthlyBudgetUSD: n }),
      monthlyCost: 0,
      addMonthlyCost: (amount) => set((state) => ({ monthlyCost: state.monthlyCost + amount })),
      monthlyResetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
    }),
    {
      name: "xagent-store",
      version: XAGENT_STORE_VERSION,
      migrate: migrateXAgentStore,
      partialize: (state) => ({
        // Yalnızca gerçek UI tercihleri persist edilir
        activeTab: state.activeTab,
        libraryView: state.libraryView,
        radarView: state.radarView,
        activeChannel: state.activeChannel,
        // newsItems ve savedTweets kullanıcı UI kütüphanesi — persist OK
        newsItems: state.newsItems.slice(0, 200),
        savedTweets: state.savedTweets,
        // Paternler kullanıcı içeriği
        patterns: state.patterns,
        // Tarama ayarları UI tercihi
        postsPerSource: state.postsPerSource,
        maxPostAge: state.maxPostAge,
        automationEnabled: state.automationEnabled,
        scanIntervalHours: state.scanIntervalHours,
        lastScanTime: state.lastScanTime,
        channelScanSchedule: state.channelScanSchedule,
        lastChannelScanDate: state.lastChannelScanDate,
        // Bütçe limiti kullanıcı ayarı
        monthlyBudgetUSD: state.monthlyBudgetUSD,
        monthlyResetDate: state.monthlyResetDate
      })
    }
  )
);

// CemOS rebrand alias — sembol/persist key legacy kalır, yeni kod bu adı kullanabilir.
export const useCemOsStore = useXAgentStore;
