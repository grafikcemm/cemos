/**
 * Deterministik eval fixture'ları (ADR-027). Her enabled registry entry'sinin
 * en az bir fixture'ı olmalı; fixture input'u entry'nin inputSchema'sından
 * geçmek ZORUNDA (validate.ts bunu fail-fast doğrular). Fixture'lar ücret
 * gerektirmez — LLM yolu testlerde mock'lanır, deterministik yollar gerçek
 * çalışır.
 */

export type AgentEvalFixture = {
  id: string;
  agentId: string;
  description: string;
  input: unknown;
};

const CURATION_CANDIDATES = [
  {
    id: "news-1",
    source: "news",
    title: "AI görsel tespiti yaygınlaşıyor",
    whyNow: "teyitli + taze",
    badge: "buzz 82",
    buzz: 82,
    ageHours: 3,
    personaFit: 0.8,
    suggestedPlatform: "X",
    topicSeed: "AI görsel tespiti",
    rawTab: "news-pool",
  },
  {
    id: "news-2",
    source: "news",
    title: "Yeni model sürümü",
    whyNow: "taze",
    badge: "buzz 60",
    buzz: 60,
    ageHours: 6,
    personaFit: 0.7,
    suggestedPlatform: "X",
    topicSeed: "model sürümü",
    rawTab: "news-pool",
  },
  {
    id: "yt-1",
    source: "youtube",
    title: "Rakip video patlaması",
    whyNow: "outlier ×4",
    badge: "×4.0",
    multiplier: 4,
    ageHours: 12,
    personaFit: 0.6,
    suggestedPlatform: "YouTube",
    topicSeed: "video konsepti",
    rawTab: "youtube",
  },
  {
    id: "radar-1",
    source: "radar",
    title: "Rakip reel outlier",
    whyNow: "outlier ×3.2",
    badge: "×3.2",
    multiplier: 3.2,
    ageHours: 20,
    personaFit: 0.65,
    suggestedPlatform: "Reels",
    topicSeed: "reel konsepti",
    rawTab: "",
  },
  {
    id: "radar-insufficient",
    source: "radar",
    title: "Az örneklemli hesap",
    whyNow: "örneklem yetersiz",
    badge: "×9.0",
    multiplier: 9,
    insufficient: true,
    ageHours: 5,
    personaFit: 0.9,
    suggestedPlatform: "Reels",
    topicSeed: "yetersiz örneklem",
    rawTab: "",
  },
  {
    id: "flow-1",
    source: "discovery",
    title: "Keşif adayı",
    whyNow: "fırsat skoru yüksek",
    badge: "keşif",
    buzz: 55,
    ageHours: 30,
    personaFit: 0.5,
    suggestedPlatform: "X",
    topicSeed: "keşif konusu",
    rawTab: "flow-radar",
  },
] as const;

export const AGENT_EVAL_FIXTURES: AgentEvalFixture[] = [
  {
    id: "orchestrator-basic",
    agentId: "cem-orchestrator",
    description: "Günlük koşu girişi geçerli",
    input: { accountHandle: "grafikcem", deadlineMs: 60_000 },
  },
  {
    id: "trend-scout-basic",
    agentId: "trend-scout",
    description: "Keşif girişi geçerli",
    input: { accountHandle: "grafikcem" },
  },
  {
    id: "strategist-basic",
    agentId: "account-strategist",
    description: "Rota kararı girişi",
    input: { text: "Cursor'un yeni composer modu tasarımcılar için pratik bir araç." },
  },
  {
    id: "creator-basic",
    agentId: "content-creator",
    description: "Taslak üretim girişi",
    input: { accountHandle: "grafikcem", sourceText: "Yeni AI aracı: gerçek kullanım notları ve sınırlamalar." },
  },
  {
    id: "viral-editor-basic",
    agentId: "viral-editor",
    description: "Skorlama girişi",
    input: { accountHandle: "grafikcem", content: "Bugün denedim: composer modu import yollarını bozuyor, elle düzelttim." },
  },
  {
    id: "guardian-basic",
    agentId: "brand-guardian",
    description: "Marka vetosu girişi",
    input: { text: "Bu araç işini 10 kat hızlandırır!", accountHandle: "grafikcem" },
  },
  {
    id: "fact-checker-basic",
    agentId: "fact-checker",
    description: "Site doğrulama girişi",
    input: { url: "https://example.com/tool" },
  },
  {
    id: "originality-basic",
    agentId: "originality-critic",
    description: "Yakın-kopya kontrol girişi",
    input: {
      text: "Cursor composer modunu denedim; import yollarını elle düzelttim.",
      corpus: ["Cursor composer modunu denedim; import yollarını elle düzelttim!", "Tamamen farklı bir konu."],
    },
  },
  {
    id: "competitor-basic",
    agentId: "competitor-analyst",
    description: "IG rakip senkron girişi",
    input: { platform: "instagram" },
  },
  {
    id: "reels-planner-basic",
    agentId: "reels-planner",
    description: "Aylık plan montaj girişi",
    input: {
      accountId: "acc-1",
      month: "2026-08",
      postDays: [3, 7, 12, 18, 24],
      pillars: ["AI araçları", "Tasarım ipuçları", "Vaka analizi"],
    },
  },
  {
    id: "learner-basic",
    agentId: "performance-learner",
    description: "Engagement senkron girişi",
    input: { accountHandle: "grafikcem" },
  },
  {
    id: "curator-knowledge-basic",
    agentId: "knowledge-curator",
    description: "Hafıza konsolidasyon girişi",
    input: { action: "consolidate_memory", handles: ["grafikcem"], deadlineMs: 30_000 },
  },
  {
    id: "curation-basic",
    agentId: "opportunity-curator",
    description: "6 aday, karışık kaynak — deterministik sıralama sabit",
    input: { candidates: CURATION_CANDIDATES.map((c) => ({ ...c })), limit: 8, perSourceCap: 4 },
  },
  {
    id: "curation-insufficient-sample",
    agentId: "opportunity-curator",
    description: "Yetersiz örneklem çarpanı buzz'a şişirilmez",
    input: {
      candidates: CURATION_CANDIDATES.filter((c) => c.source === "radar").map((c) => ({ ...c })),
      limit: 8,
      perSourceCap: 4,
    },
  },
  {
    id: "curation-source-cap",
    agentId: "opportunity-curator",
    description: "Kaynak-başına tavan uygulanır",
    input: {
      candidates: [
        ...CURATION_CANDIDATES.map((c) => ({ ...c })),
        { ...CURATION_CANDIDATES[0], id: "news-3", title: "Üçüncü haber" },
        { ...CURATION_CANDIDATES[0], id: "news-4", title: "Dördüncü haber" },
        { ...CURATION_CANDIDATES[0], id: "news-5", title: "Beşinci haber" },
      ],
      limit: 8,
      perSourceCap: 2,
    },
  },
];

export function fixturesForAgent(agentId: string): AgentEvalFixture[] {
  return AGENT_EVAL_FIXTURES.filter((f) => f.agentId === agentId);
}

export function fixtureById(id: string): AgentEvalFixture | undefined {
  return AGENT_EVAL_FIXTURES.find((f) => f.id === id);
}
