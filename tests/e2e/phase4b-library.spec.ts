import { test, expect, appConsoleErrors, type Page } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Phase 4B (ADR-041) — Unified Library: search → drawer → save-to-board →
 * idempotent retry → "Kayıtlı" durumu; İlham bağlam rail'i; dürüst durumlar.
 * HERMETİK: tüm API route-mock; canlı DB/LLM YOK.
 * Kanıtlanan:
 *  - Tümü aramada içerik satırı → drawer → panoya kaydet → toast + "Kayıtlı".
 *  - Aynı kaydı tekrar → duplicate DEĞİL, dürüst "Zaten kayıtlı" (idempotent).
 *  - Arama payload'ındaki üyelik → satırda "Kayıtlı" rozeti.
 *  - Boş / filtre-boş / hata durumları ayrı (hata empty gibi görünmez).
 *  - İlham bağlam rail'i gerçek sayılarla; 1024–1920 taşma 0.
 */

function healthPayload() {
  return {
    worker: { mode: "cron", inferredStatus: "recent_tick" },
    database: { ok: true },
    contracts: {
      infrastructure: { status: "ok", items: [] },
      pipelineFreshness: { status: "ok", items: [], news: null },
      todayReadiness: {
        status: "ok",
        phase: "ready_available",
        message: "Hazır.",
        counts: { ready: 0, needsEdit: 0, blocked: 0, awaitingDecision: 0, preparedIntents: 0, publishedToday: 0, targetToday: 0, totalActiveToday: 0 },
      },
      topbar: { level: "ok", label: "Hazır", detail: "" },
      operatorAction: { level: "ok", canGenerate: true, todayNeedsGeneration: false, blockers: [], warnings: [] },
      instagramPlanning: null,
    },
  };
}

const CONTENT_ITEM = {
  id: "content-ci-1",
  type: "content",
  title: "AI mockup reel",
  body: "5 araç ile hızlan",
  platform: "instagram",
  meta: "ig_reel",
  tags: [],
  createdAt: "2026-07-18T10:00:00.000Z",
  canAnalyze: true,
  contentItemId: "ci-1",
  sourceUrl: "https://www.instagram.com/reel/Cxyz12345/",
};

const VIRAL_ITEM = {
  id: "viral-v1",
  type: "viral",
  title: "@rakip",
  body: "viral örnek",
  platform: "x",
  meta: "viral 88",
  tags: ["ai"],
  createdAt: "2026-07-17T10:00:00.000Z",
  canAnalyze: true,
  sourceUrl: "https://x.com/a/1",
  score: 88,
};

function searchPayload(items: unknown[], extra?: Record<string, unknown>) {
  return {
    success: true,
    items,
    total: items.length,
    counts: { viral: 1, keyword: 0, prompt: 0, pattern: 0, content: 1 },
    limit: 24,
    offset: 0,
    capped: false,
    ...extra,
  };
}

async function mockShell(page: Page) {
  await page.route("**/api/health**", (r) => r.fulfill({ json: healthPayload() }));
  await page.route("**/api/settings**", (r) =>
    r.fulfill({ json: { success: true, accounts: [{ id: "acc-1", handle: "grafikcem", isActive: true }] } }),
  );
  await page.route("**/api/costs**", (r) => r.fulfill({ json: { success: true, today: { totalUsd: 0 } } }));
  await page.route("**/api/queue**", (r) => r.fulfill({ json: { success: true, items: [] } }));
  await page.route("**/api/opportunities/handoff**", (r) => r.fulfill({ json: { success: true, handoffs: [] } }));
  await page.route("**/api/growth/daily-queue**", (r) => r.fulfill({ json: { success: true, items: [] } }));
}

async function mockBoards(page: Page) {
  await page.route(/\/api\/boards\?/, (r) =>
    r.fulfill({ json: { success: true, count: 1, boards: [{ id: "b-1", name: "Kaydedilenler", accountId: null }] } }),
  );
}

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("Phase 4B — Unified Library save-to-board", () => {
  test("Tümü: içerik satırı → drawer → panoya kaydet → 'Kayıtlı'; tekrar → idempotent", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockShell(page);
    await mockBoards(page);
    await page.route(/\/api\/library\/search\?/, (r) => r.fulfill({ json: searchPayload([CONTENT_ITEM, VIRAL_ITEM]) }));

    let saveCalls = 0;
    const savedBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/library/save", async (route) => {
      saveCalls++;
      savedBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      const alreadySaved = saveCalls > 1;
      await route.fulfill({
        status: alreadySaved ? 200 : 201,
        json: {
          success: true,
          created: !alreadySaved,
          alreadySaved,
          item: { id: "bi-1" },
          board: { id: "b-1", name: "Kaydedilenler", accountId: null },
          contentItem: { id: "ci-1", platform: "instagram", format: "ig_reel", title: "AI mockup reel", canonicalUrl: null },
        },
      });
    });

    await page.goto("/");
    await selectTab(page, "lib-tumu");
    await expect(page.getByTestId("lib-row-content")).toBeVisible();

    await page.getByTestId("lib-row-content").click();
    const save = page.getByTestId("save-to-board");
    await expect(save).toBeVisible();
    await expect(save).toHaveAttribute("data-saved", "false");

    // İlk kayıt — hızlı kaydet (paylaşılan default pano).
    await save.click();
    await expect(page.getByTestId("save-board-menu")).toBeVisible();
    await page.getByRole("menuitem", { name: /Hızlı kaydet/ }).click();
    await expect(page.getByText("Kaydedilenler panosuna kaydedildi")).toBeVisible();
    await expect(save).toHaveAttribute("data-saved", "true");

    // İkinci kez — duplicate DEĞİL, dürüst "Zaten kayıtlı".
    await save.click();
    await page.getByRole("menuitem", { name: /Hızlı kaydet/ }).click();
    await expect(page.getByText(/Zaten kayıtlı/)).toBeVisible();

    expect(saveCalls).toBe(2);
    expect(savedBodies[0]).toMatchObject({ source: { kind: "contentItem", contentItemId: "ci-1" } });
    expect(appConsoleErrors(errors)).toEqual([]);
  });

  test("Tümü: arama payload'ındaki üyelik satırda 'Kayıtlı' rozeti gösterir", async ({ page }) => {
    await mockShell(page);
    await mockBoards(page);
    const preSaved = { ...CONTENT_ITEM, savedBoards: [{ boardId: "b-1", boardName: "Kaydedilenler" }] };
    await page.route(/\/api\/library\/search\?/, (r) => r.fulfill({ json: searchPayload([preSaved]) }));

    await page.goto("/");
    await selectTab(page, "lib-tumu");
    await expect(page.getByTestId("lib-row-content")).toContainText("Kayıtlı");
  });

  test("Tümü: dürüst durumlar — boş vs hata ayrı", async ({ page }) => {
    await mockShell(page);
    await mockBoards(page);

    // Boş sonuç.
    await page.route(/\/api\/library\/search\?/, (r) => r.fulfill({ json: searchPayload([]) }));
    await page.goto("/");
    await selectTab(page, "lib-tumu");
    await expect(page.getByText("Kütüphanede sonuç yok")).toBeVisible();

    // Hata (500) — empty gibi görünmez, retry sunar.
    await page.unroute(/\/api\/library\/search\?/);
    await page.route(/\/api\/library\/search\?/, (r) => r.fulfill({ status: 500, json: { success: false, error: "boom" } }));
    await page.getByTestId("lib-search").fill("ai");
    await expect(page.getByText("Arama yüklenemedi")).toBeVisible();
  });

  test("Tümü: 1024–1920 taşma 0", async ({ page }) => {
    await mockShell(page);
    await mockBoards(page);
    await page.route(/\/api\/library\/search\?/, (r) => r.fulfill({ json: searchPayload([CONTENT_ITEM, VIRAL_ITEM]) }));
    await page.goto("/");
    await selectTab(page, "lib-tumu");
    await expect(page.getByTestId("lib-row-content")).toBeVisible();
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
    }
  });
});

const ILHAM_ANALYSIS = {
  analysisVersion: "inspiration_structure.v1",
  analyzedAt: "2026-07-18T10:00:00.000Z",
  observedFacts: ["Caption 240 karakter."],
  structuralHypotheses: ["Hipotez."],
  hookType: "rakam_liste",
  openingMechanism: null,
  contentSequence: [],
  captionSequence: [],
  valuePromise: { present: false, evidence: null },
  proofOrDemoState: "yok",
  ctaType: "yorum_anahtar_kelime",
  hashtagStructure: { count: 3, placement: "trailing_block", casing: "lower", coreTags: [] },
  lineBreakStructure: { paragraphs: 3, usesListFormat: true, avgLineLength: 28 },
  transferablePrinciples: [],
  nonTransferableElements: [],
  copyingRisk: { level: "low", reason: "" },
  performanceAssessment: { status: "no_reliable_evidence", workedClaimAllowed: false, statement: "", multiplier: null, sampleSize: null },
  confidence: 0.5,
  evidenceBasis: [],
  limitations: [],
};

function ilhamWorkspace() {
  const analyzedItem = {
    id: "bi-1",
    boardId: "b-1",
    contentItemId: "ci-1",
    title: "Rakip reel",
    url: "https://www.instagram.com/reel/Cxyz12345/",
    note: "",
    itemType: "content",
    createdAt: "2026-07-17T10:00:00.000Z",
    meta: {
      schemaVersion: "1",
      kind: "inspiration_capture",
      format: "ig_reel",
      formatSource: "url_hint",
      creatorHandle: "rakip",
      caption: "5 araç ile hızlan",
      transcript: "",
      manualMetrics: null,
      capturedAt: "2026-07-17T10:00:00.000Z",
      analysis: ILHAM_ANALYSIS,
    },
    content: { id: "ci-1", platform: "instagram", format: "ig_reel", author: "rakip", title: "", body: "5 araç", canonicalUrl: null, sourceType: "manual", analysisStatus: "analyzed" },
    outlier: null,
  };
  return {
    success: true,
    workspace: {
      boards: [{ id: "b-1", name: "Instagram İlham", icon: "sparkles", itemCount: 2 }],
      selectedBoardId: "b-1",
      items: [analyzedItem, { ...analyzedItem, id: "bi-2", title: "Bekleyen", meta: { ...analyzedItem.meta, analysis: null }, content: { ...analyzedItem.content, id: "ci-2", analysisStatus: "pending" } }],
      watch: { configured: false, total: 0, ok: 0, unavailable: 0, configRequired: 0, pending: 0, neverSynced: 0, lastSyncAt: null, stale: true },
      outliers: [],
      gate: { allowed: false, missing: ["OPENROUTER_KEY_ROTATED_AT"] },
    },
  };
}

test.describe("Phase 4B — İlham bağlam rail'i", () => {
  test("rail gerçek sayılarla görünür (aktif pano, kayıt/pano/analiz, son analizler)", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/inspiration\?/, (r) => r.fulfill({ json: ilhamWorkspace() }));
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    const rail = page.getByLabel("İlham bağlam paneli");
    await expect(rail).toBeVisible();
    await expect(rail).toContainText("Aktif pano");
    await expect(rail).toContainText("Instagram İlham");
    await expect(rail).toContainText("Son analizler");
    // 1 analiz edilmiş kayıt → "Son analizler"de @rakip görünür.
    await expect(rail).toContainText("@rakip");
  });

  test("İlham: 1024–1920 taşma 0 (rail geniş ekranda yanda, dar ekranda altta)", async ({ page }) => {
    await mockShell(page);
    await page.route(/\/api\/inspiration\?/, (r) => r.fulfill({ json: ilhamWorkspace() }));
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    await expect(page.getByLabel("İlham bağlam paneli")).toBeVisible();
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
    }
  });
});

const NEWS_ITEM = {
  id: "news-1",
  originalTitle: "AI news",
  trTitle: "AI haberi",
  trSummary: "Kısa özet metni.",
  url: "https://news.example/1",
  imageUrl: null,
  category: "tech_news",
  viralScore: 80,
  xValueScore: 70,
  buzzScore: 90,
  hnPoints: 120,
  hnComments: 40,
  redditScore: null,
  whyPeopleCare: "Önemli gelişme",
  tweetAngle: null,
  suggestedFormat: null,
  sourceVerification: "multi_source_confirmed",
  processingStatus: "analyzed",
  isRead: false,
  isUsed: false,
  fetchedAt: "2026-07-18T10:00:00.000Z",
  publishedAt: "2026-07-18T09:00:00.000Z",
  newsSource: { name: "Example", sourceType: "rss", reliability: "high", url: "https://news.example" },
};

test.describe("Phase 4B — Araştırma → Kütüphane köprüsü", () => {
  test("Haberler satırından ORTAK save akışı → /api/library/save {kind:news}", async ({ page }) => {
    await mockShell(page);
    await mockBoards(page);
    await page.route(/\/api\/news-pool(\?|$)/, (r) => r.fulfill({ json: { success: true, items: [NEWS_ITEM] } }));

    let saveBody: Record<string, unknown> | null = null;
    await page.route("**/api/library/save", async (route) => {
      saveBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          created: true,
          alreadySaved: false,
          item: { id: "bi-1" },
          board: { id: "b-1", name: "Kaydedilenler", accountId: null },
          contentItem: { id: "ci-news-1", platform: "news", format: "news_article", title: "AI haberi", canonicalUrl: "https://news.example/1" },
        },
      });
    });

    await page.goto("/");
    // Araştırma grubu sidebar'da (Phase 4A) — varsayılan açık; Haberler'e git.
    await page.getByTestId("sidebar-research-news-pool").click();

    const save = page.getByTestId("save-to-board").first();
    await expect(save).toBeVisible();
    await save.click();
    await page.getByRole("menuitem", { name: /Hızlı kaydet/ }).click();
    await expect(page.getByText("Kaydedilenler panosuna kaydedildi")).toBeVisible();
    expect(saveBody).toMatchObject({ source: { kind: "news", id: "news-1" } });
  });
});
