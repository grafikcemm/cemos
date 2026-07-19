import { test, expect, type Page } from "@playwright/test";
import { selectTab } from "./helpers/nav";

/**
 * Phase 2E (ADR-034) — eval/curation/readiness gözlemlenebilirlik e2e'si.
 * HERMETİK: /api/health, /api/costs, /api/eval/*, fırsat motorları ve
 * /api/opportunities/curate route-mock — canlı LLM/DB mutasyonu YOK.
 * Kanıtlanan:
 *  - Profil > Sistem "Agent değerlendirmeleri": hiç-koşmadı / geçti /
 *    blocked-external durumları + gözlenen trace kapsaması (dürüst dil).
 *  - Costs: evaluation bütçe/harcama + son eval koşusu + kürasyon harcaması
 *    (production'dan ayrı sınıf).
 *  - Fırsatlar: deterministic durumda agent rozeti YOK; server "agent" dönerse
 *    rozet görünür (dürüst etiket).
 *  - 1024–1920 yatay taşma 0; console app error 0.
 */

const CONTRACTS_BASE = {
  infrastructure: { status: "ok", items: [{ key: "db", label: "Veritabanı", status: "ok" }] },
  pipelineFreshness: { status: "ok", items: [], news: null },
  todayReadiness: {
    status: "ok",
    phase: "ready_available",
    counts: { ready: 2, needsEdit: 0, blocked: 0, preparedIntents: 0, publishedToday: 0, targetToday: 1 },
    message: "Yayına hazır taslak var.",
  },
  topbar: { level: "none", label: "sağlıklı" },
  operatorAction: {
    level: "ok",
    canGenerate: true,
    todayNeedsGeneration: false,
    blockers: [],
    warnings: [],
  },
};

const HEALTH_PAYLOAD = {
  status: "healthy",
  checks: {},
  contracts: CONTRACTS_BASE,
};

const COSTS_PAYLOAD = {
  today: { totalUsd: 0.12, socialDataTweets: 10, socialDataUsd: 0.002, openRouterUsd: 0.1 },
  month: { totalUsd: 1.5, budgetUsd: 10, socialDataUsd: 0.1, openRouterUsd: 1.4 },
  lineItems: {
    socialData: { provider: "socialdata", tweets: 100, unitPriceUsd: 0.0002, costUsd: 0.02 },
    openRouter: { provider: "openrouter", costUsd: 1.4, byPurpose: [], byModel: [], byPreset: [] },
  },
  evaluation: { enabled: false, monthlyBudgetUsd: 0.5, monthSpendUsd: 0.031, curationMonthSpendUsd: 0.012 },
  budgetStatus: { allowed: true },
  dailySeries: [],
  limits: {
    dailyTweetBudget: 100,
    maxSourcesPerAccount: 3,
    maxTweetsPerSource: 10,
    monthlyBudgetUsd: 10,
    costPerItem: 0.01,
    costPerGeneration: 0.02,
  },
};

const KPIS_PAYLOAD = {
  success: true,
  windowDays: 30,
  acceptanceRate: 0.8,
  decidedCount: 10,
  medianEditDistance: 0.1,
  editSampleCount: 5,
  goldenPassPct: 100,
  goldenScored: 40,
};

function evalRunsPayload(kind: "none" | "passed" | "blocked") {
  const registry =
    kind === "none"
      ? null
      : {
          id: "run-reg",
          status: kind === "passed" ? "passed" : "partial",
          mode: "deterministic",
          startedAt: new Date().toISOString(),
          passedCount: 16,
          failedCount: 0,
          skippedCount: 0,
          totalCostUsd: 0,
          errorClass: null,
        };
  const blockedLive =
    kind === "blocked"
      ? {
          id: "run-live",
          status: "blocked_external",
          mode: "live",
          startedAt: new Date().toISOString(),
          passedCount: 0,
          failedCount: 0,
          skippedCount: 1,
          totalCostUsd: 0,
          errorClass: "live_gates_missing",
        }
      : null;
  return {
    success: true,
    runs: registry ? [{ ...registry, kind: "registry_contract", trigger: "cron", policyVersion: "2E-1" }] : [],
    latest: {
      registry_contract: registry,
      golden_live: null,
      curator_live: blockedLive,
      thread_smoke: blockedLive,
    },
    traceCoverage:
      kind === "none"
        ? { runsConsidered: 0, expected: 0, persisted: 0, failed: 0, skipped: 0, coveragePct: null }
        : { runsConsidered: 3, expected: 10, persisted: 9, failed: 1, skipped: 4, coveragePct: 90 },
    registryTraces7d: 12,
  };
}

// ADR-046: dürüst kalibrasyon durumu — yetersiz gerçek sonuç örneklemi → KALİBRE DEĞİL.
const CALIBRATION_PAYLOAD = {
  success: true,
  status: {
    outcomeCalibrated: false,
    reason: "Yetersiz gerçek sonuç örneklemi (eşleşen 0 < 5). Sistem KALİBRE DEĞİL — kalite eşikleri provisional kalır.",
    samples: [
      { key: "matched_outcomes", label: "Eşleşen yayın-sonrası ölçüm (X)", observed: 0, floor: 5, sufficient: false, note: "Canlı besleme yok." },
      { key: "validated_patterns", label: "Doğrulanmış pattern", observed: 0, floor: 1, sufficient: false, note: "Aday (doğrulanmamış): 0." },
    ],
    normalization: { active: false, note: "normalizedScore şu an ham engagement skoru." },
    thresholds: { readinessPolicyVersion: "1.1.0-provisional", provisional: true, note: "provisional — canlı kalibrasyon bekliyor." },
    eval: {
      registryContract: { present: true, status: "passed", policyVersion: "2E-1", passed: 16, failed: 0, at: "2026-07-19T00:00:00Z" },
      golden: { present: false, status: null, policyVersion: null, passed: 0, failed: 0, at: null },
    },
    blockers: ["Canlı X API + SocialData — blocked-external."],
    sectionErrors: [],
  },
};

async function mockSystemSurfaces(page: Page, runsKind: "none" | "passed" | "blocked") {
  await page.route("**/api/health**", (route) => route.fulfill({ json: HEALTH_PAYLOAD }));
  await page.route("**/api/costs**", (route) => route.fulfill({ json: COSTS_PAYLOAD }));
  await page.route("**/api/eval/kpis**", (route) => route.fulfill({ json: KPIS_PAYLOAD }));
  await page.route("**/api/eval/runs**", (route) => route.fulfill({ json: evalRunsPayload(runsKind) }));
  await page.route("**/api/quality/calibration**", (route) => route.fulfill({ json: CALIBRATION_PAYLOAD }));
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

function collectAppErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return errors;
}

test.describe("Profil > Sistem — Agent değerlendirmeleri (ADR-034 §I)", () => {
  test("geçti + blocked-external canlı durum + gözlenen trace kapsaması görünür", async ({ page }) => {
    const errors = collectAppErrors(page);
    await mockSystemSurfaces(page, "blocked");
    await page.goto("/");
    await selectTab(page, "system");

    const section = page.getByTestId("agent-eval-section");
    await expect(section).toBeVisible({ timeout: 20_000 });
    const metrics = page.getByTestId("agent-eval-metrics");
    await expect(metrics).toContainText("registry (deterministic)");
    await expect(metrics).toContainText("blocked-external");
    await expect(metrics).toContainText("gözlenen trace kapsaması");
    await expect(metrics).toContainText("%90");
    // Dürüst dil: blocked-external üretim kesintisi gibi sunulmaz.
    await expect(section).toContainText("üretim kesintisi değildir");
    expect(errors).toEqual([]);
  });

  test("ADR-046: kalibrasyon durumu DÜRÜST — yetersiz örneklem → 'KALİBRE DEĞİL' (sahte kalibre yok)", async ({ page }) => {
    await mockSystemSurfaces(page, "passed");
    await page.goto("/");
    await selectTab(page, "system");
    const calib = page.getByTestId("calibration-status");
    await expect(calib).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("calibration-verdict")).toContainText("KALİBRE DEĞİL");
    await expect(page.getByTestId("calib-sample-matched_outcomes")).toContainText("0/5");
    // Normalizasyon dürüstlüğü + provisional eşik görünür.
    await expect(calib).toContainText("normalize değil");
    await expect(calib).toContainText("1.1.0-provisional");
  });

  test("hiç koşmadı durumu dürüst gösterilir (sahte %100 yok)", async ({ page }) => {
    await mockSystemSurfaces(page, "none");
    await page.goto("/");
    await selectTab(page, "system");
    const metrics = page.getByTestId("agent-eval-metrics");
    await expect(metrics).toContainText("hiç koşmadı");
    await expect(metrics).toContainText("veri yok");
  });

  test("1024–1920 yatay taşma 0", async ({ page }) => {
    await mockSystemSurfaces(page, "passed");
    await page.goto("/");
    await selectTab(page, "system");
    await expect(page.getByTestId("agent-eval-section")).toBeVisible({ timeout: 20_000 });
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await horizontalOverflow(page), `width=${width}`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("Costs — evaluation bütçesi (ADR-034 §I)", () => {
  test("eval bütçe/harcama + son koşu + kürasyon harcaması ayrı görünür", async ({ page }) => {
    const errors = collectAppErrors(page);
    await mockSystemSurfaces(page, "passed");
    await page.goto("/");
    await selectTab(page, "costs");

    await expect(page.getByText("Eval bütçesi (ay)")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("$0.0310 / $0.50")).toBeVisible();
    await expect(page.getByText("Son eval koşusu")).toBeVisible();
    await expect(page.getByText("Kürasyon harcaması (ay)")).toBeVisible();
    await expect(page.getByText("$0.0120")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("Fırsatlar — dürüst kürasyon etiketi (ADR-034 §E)", () => {
  const NEWS = {
    success: true,
    items: [
      {
        id: "n1",
        trTitle: "Yeni AI aracı çıktı",
        trSummary: "Özet",
        tweetAngle: "Açı",
        buzzScore: 85,
        sourceVerification: "multi_source_confirmed",
        fetchedAt: new Date().toISOString(),
        newsSource: { name: "Kaynak" },
      },
    ],
  };

  async function mockEngines(page: Page) {
    await page.route("**/api/news-pool**", (route) => route.fulfill({ json: NEWS }));
    await page.route("**/api/youtube/videos**", (route) => route.fulfill({ json: { success: true, videos: [] } }));
    await page.route("**/api/instagram/outliers**", (route) => route.fulfill({ json: { success: true, items: [] } }));
    await page.route("**/api/growth/flow-radar**", (route) => route.fulfill({ json: { success: true, candidates: [] } }));
    await page.route("**/api/opportunities/handoff**", (route) => route.fulfill({ json: { success: true, handoffs: [] } }));
  }

  test("server deterministic dönerse agent rozeti GÖRÜNMEZ", async ({ page }) => {
    await mockEngines(page);
    await page.route("**/api/opportunities/curate", (route) =>
      route.fulfill({
        json: {
          success: true,
          method: "deterministic",
          fallbackReason: "curation_agent_disabled",
          selections: [{ sourceId: "news-n1", score: 80, reasons: {} }],
        },
      })
    );
    await page.goto("/");
    await selectTab(page, "plan-firsatlar");
    await expect(page.getByText("Yeni AI aracı çıktı")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("opp-agent-news-n1")).toHaveCount(0);
  });

  test("server GERÇEK agent başarısı dönerse rozet görünür", async ({ page }) => {
    await mockEngines(page);
    await page.route("**/api/opportunities/curate", (route) =>
      route.fulfill({
        json: {
          success: true,
          method: "agent",
          fallbackReason: null,
          selections: [{ sourceId: "news-n1", score: 91, reasons: { personaFit: "Tasarımcı kitlesiyle birebir örtüşüyor" } }],
        },
      })
    );
    await page.goto("/");
    await selectTab(page, "plan-firsatlar");
    await expect(page.getByTestId("opp-agent-news-n1")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("opp-agent-news-n1")).toContainText("agent seçimi");
  });

  test("curate route düşerse lokal deterministik fallback fırsatları yine gösterir", async ({ page }) => {
    await mockEngines(page);
    await page.route("**/api/opportunities/curate", (route) => route.abort());
    await page.goto("/");
    await selectTab(page, "plan-firsatlar");
    await expect(page.getByText("Yeni AI aracı çıktı")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("opp-agent-news-n1")).toHaveCount(0);
  });
});
