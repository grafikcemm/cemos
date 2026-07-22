import { test, expect, appConsoleErrors, type Page } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Phase 3C — Kütüphane→İlham Inspiration Intelligence e2e'si.
 * HERMETİK: /api/settings + /api/inspiration(+capture/analyze) route-mock —
 * canlı DB/LLM/Meta yok. Kanıtlanan:
 *  - no-board / empty / dolu grid + filtreler
 *  - capture drawer TEK atomik isteğe gider (iki-request orphan akışı KALKTI)
 *  - detay: gözlenen-gerçek vs hipotez, "neden çalışabilir" dili, metrik
 *    provenance (manuel ≠ Meta), insufficient çarpan sayı olarak GÖSTERİLMEZ
 *  - AI kapısı kapalı: yalnız ENV ADLARI, deterministik analiz açık kalır
 *  - watchlist config-required + "CemOS ortak rakip listesi" etiketi
 *  - 1024–1920 yatay taşma 0; console app error 0.
 */

const ANALYSIS = {
  analysisVersion: "inspiration_structure.v1",
  analyzedAt: "2026-07-18T10:00:00.000Z",
  observedFacts: ["Caption 240 karakter, 8 satır, 3 paragraf.", "3 hashtag (sonda blok, lower)."],
  structuralHypotheses: ["Hipotez: rakam_liste tipi açılış izleyiciyi ilk saniyede durdurmayı hedefliyor."],
  hookType: "rakam_liste",
  openingMechanism: "Rakamlı liste vaadi: 5 araç ile hızlan",
  contentSequence: ["anlatım", "gösterim/örnek", "kapanış/CTA (yorum_anahtar_kelime)"],
  captionSequence: ["hook satırı", "liste bloğu", "CTA (yorum_anahtar_kelime)", "hashtag bloğu"],
  valuePromise: { present: true, evidence: "5 araç ile hızlan" },
  proofOrDemoState: "metinde_kanit_iddiasi",
  ctaType: "yorum_anahtar_kelime",
  hashtagStructure: { count: 3, placement: "trailing_block", casing: "lower", coreTags: ["#ai", "#tasarim", "#figma"] },
  lineBreakStructure: { paragraphs: 3, usesListFormat: true, avgLineLength: 28 },
  transferablePrinciples: ["Somut sayı vaadi (N araç/adım) beklentiyi netleştirir; içerik sayıyı karşılamalı."],
  nonTransferableElements: ["@rakip kişisel kimliği/yüzü/ses tonu."],
  copyingRisk: { level: "low", reason: "Formülik yapı: şablon kendi içeriğinle doldurulabilir." },
  performanceAssessment: {
    status: "no_reliable_evidence",
    workedClaimAllowed: false,
    statement: "Güvenilir performans kanıtı yok. Bu analiz yalnız yapısal hipotezdir: içerik ÇALIŞABİLİR, çalıştığı iddia edilmez.",
    multiplier: null,
    sampleSize: null,
  },
  confidence: 0.5,
  evidenceBasis: ["caption (operatör girdisi — API'den çekilmedi)"],
  limitations: ["Görsel/video pikselleri analiz edilmedi — tüm çıkarımlar metin girdilerinden."],
};

const ITEM_ANALYZED = {
  id: "bi-1",
  boardId: "b-1",
  contentItemId: "ci-1",
  title: "Rakip reel — 5 araç",
  url: "https://www.instagram.com/reel/Cxyz12345/",
  note: "Hook çok iyi",
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
    manualMetrics: {
      provenance: "operator_observed",
      observedAt: "2026-07-17T10:00:00.000Z",
      likes: 1200,
    },
    capturedAt: "2026-07-17T10:00:00.000Z",
    analysis: ANALYSIS,
  },
  content: {
    id: "ci-1",
    platform: "instagram",
    format: "ig_reel",
    author: "rakip",
    title: "",
    body: "5 araç ile hızlan",
    canonicalUrl: "https://www.instagram.com/reel/Cxyz12345/",
    sourceType: "manual",
    analysisStatus: "analyzed",
  },
  outlier: { multiplier: null, insufficient: true, sampleSize: 2, baselineMedian: 0, computedAt: "2026-07-17T06:00:00.000Z" },
};

const ITEM_PENDING = {
  ...ITEM_ANALYZED,
  id: "bi-2",
  title: "Carousel örneği",
  note: "",
  meta: { ...ITEM_ANALYZED.meta, format: "ig_carousel", analysis: null, manualMetrics: null },
  content: { ...ITEM_ANALYZED.content, id: "ci-2", format: "ig_carousel", analysisStatus: "pending" },
  outlier: null,
};

function workspacePayload(opts?: { boards?: boolean; items?: boolean; configured?: boolean }) {
  const hasBoards = opts?.boards ?? true;
  return {
    success: true,
    workspace: {
      boards: hasBoards ? [{ id: "b-1", name: "Instagram İlham", icon: "sparkles", itemCount: 2 }] : [],
      selectedBoardId: hasBoards ? "b-1" : null,
      items: hasBoards && (opts?.items ?? true) ? [ITEM_ANALYZED, ITEM_PENDING] : [],
      watch: {
        configured: opts?.configured ?? false,
        total: 24,
        ok: 20,
        unavailable: 4,
        configRequired: 0,
        pending: 0,
        neverSynced: 4,
        lastSyncAt: "2026-07-11T06:00:00.000Z",
        stale: true,
      },
      outliers: [
        {
          contentItemId: "o-1",
          author: "rakip",
          format: "ig_reel",
          caption: "Patlayan içerik",
          url: "https://www.instagram.com/reel/Cout1111/",
          publishedAt: "2026-07-15T00:00:00.000Z",
          multiplier: 3.4,
          insufficient: false,
          sampleSize: 12,
          computedAt: "2026-07-16T06:00:00.000Z",
        },
        {
          contentItemId: "o-2",
          author: "yeni_hesap",
          format: "ig_carousel",
          caption: "Az örneklemli içerik",
          url: null,
          publishedAt: null,
          multiplier: null,
          insufficient: true,
          sampleSize: 2,
          computedAt: "2026-07-16T06:00:00.000Z",
        },
      ],
      gate: {
        allowed: false,
        missing: [
          "OPENROUTER_KEY_ROTATED_AT",
          "INSTAGRAM_GENERATION_ENABLED",
          "INSTAGRAM_GENERATION_LIVE_APPROVED",
          "INSTAGRAM_GENERATION_MAX_USD",
        ],
      },
    },
  };
}

async function mockIlham(page: Page, payload: ReturnType<typeof workspacePayload>) {
  await page.route("**/api/settings**", (r) =>
    r.fulfill({ json: { success: true, accounts: [{ id: "acc-1", handle: "grafikcem" }] } }),
  );
  // Regex: yalnız workspace GET'i (capture/analyze POST'ları ayrı mock'lanır).
  await page.route(/\/api\/inspiration\?/, (r) => r.fulfill({ json: payload }));
}

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("Phase 3C — Kütüphane→İlham", () => {
  test("pano yokken dürüst empty state + hesap seçici görünür", async ({ page }) => {
    await mockIlham(page, workspacePayload({ boards: false }));
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    await expect(page.getByTestId("ilham-account-select")).toBeVisible();
    await expect(page.getByText("Bu hesabın panosu yok")).toBeVisible();
  });

  test("grid + filtreler: format filtresi carousel'i ayırır", async ({ page }) => {
    await mockIlham(page, workspacePayload());
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    await expect(page.getByTestId("ilham-item-card")).toHaveCount(2);
    await page.getByLabel("Format filtresi").selectOption("ig_carousel");
    await expect(page.getByTestId("ilham-item-card")).toHaveCount(1);
    await expect(page.getByText("Carousel örneği")).toBeVisible();
    await page.getByLabel("Analiz filtresi").selectOption("analyzed");
    await expect(page.getByTestId("ilham-item-card")).toHaveCount(0);
  });

  test("capture drawer TEK atomik isteğe gider; başarıda liste tazelenir", async ({ page }) => {
    await mockIlham(page, workspacePayload());
    let captureBody: Record<string, unknown> | null = null;
    let captureCalls = 0;
    await page.route("**/api/inspiration/capture", async (route) => {
      captureCalls++;
      captureBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        json: { success: true, created: true, board: { id: "b-1", name: "Instagram İlham" }, boardItem: { id: "bi-9" }, contentItem: { id: "ci-9", externalId: "shortcode_Cnew99999" } },
      });
    });
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    await page.getByTestId("ilham-capture-open").click();
    await page.getByTestId("ilham-capture-url").fill("https://www.instagram.com/reel/Cnew99999/");
    await page.getByTestId("ilham-capture-caption").fill("Test caption");
    await page.getByTestId("ilham-capture-save").click();
    await expect(page.getByText("İlham kaydedildi.")).toBeVisible();
    expect(captureCalls).toBe(1);
    expect(captureBody).toMatchObject({
      accountId: "acc-1",
      boardId: "b-1",
      url: "https://www.instagram.com/reel/Cnew99999/",
      caption: "Test caption",
    });
  });

  test("detay: hipotez dili + provenance ayrımı + insufficient çarpan sayı DEĞİL + AI blocked env adları", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockIlham(page, workspacePayload());
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    await page.getByText("Rakip reel — 5 araç").click();
    const detail = page.getByTestId("ilham-detail");
    await expect(detail).toBeVisible();
    // "Neden çalışabilir" — çalıştı iddiası YOK (kanıt yok).
    await expect(detail.getByText("Neden çalışabilir (yapısal hipotez)")).toBeVisible();
    // Manuel metrik provenance açık.
    await expect(detail.getByText("Manuel metrik (operatör gözlemi — Meta verisi değil)")).toBeVisible();
    // Insufficient provider çarpanı sayı olarak gösterilmez.
    await expect(detail.getByText("çarpan güvenilir değil — örneklem 2")).toBeVisible();
    // Gözlenen gerçekler vs hipotez ayrımı.
    await expect(detail.getByText("Gözlenen gerçekler")).toBeVisible();
    await expect(detail.getByText("Yapısal hipotezler")).toBeVisible();
    await expect(detail.getByText("Sınırlamalar")).toBeVisible();
    // AI kapısı kapalı: yalnız ENV ADLARI.
    await expect(page.getByTestId("ilham-ai-blocked")).toBeVisible();
    await expect(page.getByTestId("ilham-ai-blocked")).toContainText("INSTAGRAM_GENERATION_ENABLED");
    expect(appConsoleErrors(errors)).toEqual([]);
  });

  test("analiz bekleyen kayıtta ücretsiz deterministik analiz tetiklenir", async ({ page }) => {
    await mockIlham(page, workspacePayload());
    let analyzeBody: Record<string, unknown> | null = null;
    await page.route("**/api/inspiration/analyze", async (route) => {
      analyzeBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { success: true, analysis: ANALYSIS } });
    });
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    await page.getByText("Carousel örneği").click();
    await page.getByTestId("ilham-analyze").click();
    await expect(page.getByText("Deterministik yapısal analiz üretildi (ücretsiz).")).toBeVisible();
    expect(analyzeBody).toMatchObject({ accountId: "acc-1", boardItemId: "bi-2" });
  });

  test("watchlist: config-required dürüst blocked + ortak liste etiketi + az örneklem feed satırı", async ({ page }) => {
    await mockIlham(page, workspacePayload({ configured: false }));
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    await expect(page.getByText("CemOS ortak rakip listesi")).toBeVisible();
    await expect(page.getByTestId("ilham-watch-blocked")).toBeVisible();
    await expect(page.getByTestId("ilham-watch-blocked")).toContainText("META_IG_USER_ID");
    await expect(page.getByText("3.4×")).toBeVisible();
    await expect(page.getByText("az örneklem (2)")).toBeVisible();
  });

  test("1024–1920 yatay taşma 0", async ({ page }) => {
    await mockIlham(page, workspacePayload());
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `width=${width}`).toBeLessThanOrEqual(0);
    }
  });
});
