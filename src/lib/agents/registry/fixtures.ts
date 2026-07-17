/**
 * Deterministik eval fixture'ları (ADR-027 + ADR-034 contract katmanı).
 * Her enabled registry entry'sinin en az bir fixture'ı olmalı; fixture input'u
 * entry'nin inputSchema'sından geçmek ZORUNDA (validate.ts fail-fast doğrular).
 * Fixture'lar ücret gerektirmez — hermetic koşuda LLM/DB/network yan etkili
 * adapter'lar mock'lanır (hermeticAdapters.ts), yalnız SAF yollar gerçek çalışır.
 *
 * DÜRÜSTLÜK SÖZLEŞMESİ: hermetic mock geçişi "production agent doğrulandı"
 * DEMEK DEĞİLDİR — sonuç her zaman mode=deterministic olarak etiketlenir.
 */

import type { AgentRunStatus } from "./types";

export type AgentContractExpectation = {
  /** Hermetic koşuda kabul edilen outcome sınıfları (executor AgentRunStatus). */
  expectedOutcomes: AgentRunStatus[];
  /** true ⇒ aynı girdi iki koşuda aynı çıktıyı üretmeli (yalnız gerçek-saf yollar). */
  deterministic: boolean;
  /**
   * Canlı (ücretli) eval allowlist'i. Başlangıçta YALNIZ opportunity-curator
   * ve content-creator (evaluation-mode thread smoke). Publish/social-write/
   * memory-write agent'ları canlı eval'e ALINMAZ.
   */
  liveAllowlisted: boolean;
  /** Bildirimsel çıktı denetimi; ihlal mesajları döndürür (boş dizi = geçti). */
  assertOutput?: (output: unknown) => string[];
};

export type AgentEvalFixture = {
  id: string;
  agentId: string;
  description: string;
  input: unknown;
  contract: AgentContractExpectation;
};

/** Varsayılan hermetic-mock sözleşmesi: mock çıktı şemadan geçip succeeded olmalı. */
const HERMETIC_OK: AgentContractExpectation = {
  expectedOutcomes: ["succeeded"],
  deterministic: false,
  liveAllowlisted: false,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Kürasyon çıktısı sözleşmesi: method=deterministic (hermetic koşuda LLM iddiası
 * YASAK) + her selection.sourceId girdi adaylarına bağlı (uydurma id fail).
 */
function curationBinding(validIds: string[]): (output: unknown) => string[] {
  const valid = new Set(validIds);
  return (output) => {
    const issues: string[] = [];
    if (!isRecord(output)) return ["output obje değil"];
    if (output.method !== "deterministic") {
      issues.push(`hermetic koşuda method="deterministic" bekleniyordu (gelen: ${String(output.method)})`);
    }
    if (!Array.isArray(output.selections) || output.selections.length === 0) {
      issues.push("selections boş");
      return issues;
    }
    for (const s of output.selections) {
      if (!isRecord(s) || typeof s.sourceId !== "string" || !valid.has(s.sourceId)) {
        issues.push(`bağsız sourceId: ${isRecord(s) ? String(s.sourceId) : "?"}`);
      }
    }
    return issues;
  };
}

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
    contract: HERMETIC_OK,
    input: { accountHandle: "grafikcem", deadlineMs: 60_000 },
  },
  {
    id: "trend-scout-basic",
    agentId: "trend-scout",
    description: "Keşif girişi geçerli",
    contract: HERMETIC_OK,
    input: { accountHandle: "grafikcem" },
  },
  {
    id: "strategist-basic",
    agentId: "account-strategist",
    description: "Rota kararı girişi",
    contract: HERMETIC_OK,
    input: { text: "Cursor'un yeni composer modu tasarımcılar için pratik bir araç." },
  },
  {
    id: "creator-basic",
    agentId: "content-creator",
    description: "Taslak üretim girişi",
    // Canlı allowlist: evaluation-mode thread smoke (ADR-034 §J) — publish YOK.
    contract: { ...HERMETIC_OK, liveAllowlisted: true },
    input: { accountHandle: "grafikcem", sourceText: "Yeni AI aracı: gerçek kullanım notları ve sınırlamalar." },
  },
  {
    id: "viral-editor-basic",
    agentId: "viral-editor",
    description: "Skorlama girişi",
    contract: HERMETIC_OK,
    input: { accountHandle: "grafikcem", content: "Bugün denedim: composer modu import yollarını bozuyor, elle düzelttim." },
  },
  {
    id: "guardian-basic",
    agentId: "brand-guardian",
    description: "Marka vetosu girişi",
    contract: HERMETIC_OK,
    input: { text: "Bu araç işini 10 kat hızlandırır!", accountHandle: "grafikcem" },
  },
  {
    id: "fact-checker-basic",
    agentId: "fact-checker",
    description: "Site doğrulama girişi",
    contract: HERMETIC_OK,
    input: { url: "https://example.com/tool" },
  },
  {
    id: "originality-basic",
    agentId: "originality-critic",
    description: "Yakın-kopya kontrol girişi",
    // Gerçek-saf yol (textSimilarity — DB/network yok): deterministik + assert'li.
    contract: {
      expectedOutcomes: ["succeeded"],
      deterministic: true,
      liveAllowlisted: false,
      assertOutput: (output) => {
        const issues: string[] = [];
        if (!isRecord(output)) return ["output obje değil"];
        if (output.nearDuplicate !== true) issues.push("nearDuplicate=true bekleniyordu");
        if (output.matchedIndex !== 0) issues.push("matchedIndex=0 bekleniyordu");
        return issues;
      },
    },
    input: {
      text: "Cursor composer modunu denedim; import yollarını elle düzelttim.",
      corpus: ["Cursor composer modunu denedim; import yollarını elle düzelttim!", "Tamamen farklı bir konu."],
    },
  },
  {
    id: "competitor-basic",
    agentId: "competitor-analyst",
    description: "IG rakip senkron girişi",
    contract: HERMETIC_OK,
    input: { platform: "instagram" },
  },
  {
    id: "reels-planner-basic",
    agentId: "reels-planner",
    description: "Aylık plan montaj girişi",
    contract: HERMETIC_OK,
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
    contract: HERMETIC_OK,
    input: { accountHandle: "grafikcem" },
  },
  {
    id: "curator-knowledge-basic",
    agentId: "knowledge-curator",
    description: "Hafıza konsolidasyon girişi",
    contract: HERMETIC_OK,
    input: { action: "consolidate_memory", handles: ["grafikcem"], deadlineMs: 30_000 },
  },
  {
    id: "curator-knowledge-reconcile",
    agentId: "knowledge-curator",
    description: "Deterministik sinyal reconciliation girişi (LLM'siz)",
    contract: HERMETIC_OK,
    input: { action: "reconcile_signals", lookbackDays: 14 },
  },
  {
    id: "curation-basic",
    agentId: "opportunity-curator",
    description: "6 aday, karışık kaynak — deterministik sıralama sabit",
    // Hermetic koşuda gerçek deterministik kürasyon yolu çalışır (saf).
    contract: {
      expectedOutcomes: ["succeeded"],
      deterministic: true,
      liveAllowlisted: true,
      assertOutput: curationBinding(CURATION_CANDIDATES.map((c) => c.id)),
    },
    input: { candidates: CURATION_CANDIDATES.map((c) => ({ ...c })), limit: 8, perSourceCap: 4 },
  },
  {
    id: "curation-insufficient-sample",
    agentId: "opportunity-curator",
    description: "Yetersiz örneklem çarpanı buzz'a şişirilmez",
    contract: {
      expectedOutcomes: ["succeeded"],
      deterministic: true,
      liveAllowlisted: true,
      assertOutput: curationBinding(
        CURATION_CANDIDATES.filter((c) => c.source === "radar").map((c) => c.id)
      ),
    },
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
    contract: {
      expectedOutcomes: ["succeeded"],
      deterministic: true,
      liveAllowlisted: true,
      assertOutput: (output) => {
        const issues = curationBinding([
          ...CURATION_CANDIDATES.map((c) => c.id),
          "news-3",
          "news-4",
          "news-5",
        ])(output);
        if (!isRecord(output) || !Array.isArray(output.selections)) return issues;
        const newsCount = output.selections.filter(
          (s) => isRecord(s) && typeof s.sourceId === "string" && s.sourceId.startsWith("news-")
        ).length;
        if (newsCount > 2) issues.push(`perSourceCap=2 ihlali: ${newsCount} news seçildi`);
        return issues;
      },
    },
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
