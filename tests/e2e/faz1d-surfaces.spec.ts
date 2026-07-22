import { test, expect } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Faz 1D — host yüzeyleri gerçek (placeholder değil) + navigasyon/erişim
 * sözleşmeleri. Hermetik (canlı Neon okuma; mutasyon yok). globalSetup ile
 * kimlikli koşar. Advanced ekran (flow-radar/source-intelligence) kapsamı ayrı
 * bloklarda.
 */

async function noHorizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
}

/**
 * Kullanıcı-görünür "settled" sinyali: tüm skeleton'lar kalktı (`data-skeleton`
 * count 0) — veri ilk yüklemesi bitti. Faz 1D.1 sözleşmesinin kullandığı AYNI
 * sinyal (arbitrary wait DEĞİL). First-navigation'da segment/anchor henüz
 * skeleton'ın altındayken assert'i beklemekten korur (Race B).
 */
const SETTLE_TIMEOUT = 30_000;
async function waitSettled(page: import("@playwright/test").Page) {
  await expect(page.locator("[data-skeleton]")).toHaveCount(0, { timeout: SETTLE_TIMEOUT });
}

// Profil yüzeyleri GERÇEK veri gösterir (placeholder değil). Hermetik ortamda bu iki
// uç mock'lanır: /api/integrations prisma (account/binding) SORGULAR → dummy DB'de
// gerçek yanıt gelmez; /api/memory/knowledge DB-bağlı. fixtures catch-all'ını ezer
// (beforeEach fixture page-setup'ından SONRA kaydolur). Sağlayıcı satırları yalnız
// env ADI + `note` gösterir; hiçbir secret VALUE yok (X API `note`'ta "ödeme onayı",
// tier2 `note`'ta "Vercel Workflows").
test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/api/integrations",
    (route) =>
      route.fulfill({
        json: {
          success: true,
          providers: [
            { key: "openrouter", name: "OpenRouter", group: "core", status: "connected", envNames: ["OPENROUTER_API_KEY"], note: "" },
            { key: "socialdata", name: "SocialData", group: "core", status: "connected", envNames: ["SOCIALDATA_API_KEY"], note: "" },
            { key: "composio", name: "Composio · Instagram (read-only)", group: "social", status: "connected", envNames: ["COMPOSIO_CONSUMER_API_KEY"], note: "" },
            { key: "meta", name: "Meta / Instagram (direct)", group: "social", status: "missing", envNames: ["META_ACCESS_TOKEN"], note: "" },
            { key: "xapi", name: "X API", group: "social", status: "blocked", envNames: [], note: "CemOS içinden doğrudan yayın için ödeme onayı gerekiyor. Şu an intent-only (X'te aç)." },
            { key: "tier2_worker", name: "Tier-2 render worker", group: "optional", status: "blocked", envNames: [], note: "Otomatik reels/carousel medya-render aşaması henüz uygulanmadı. Vercel Workflows veya ayrı bir worker teknik olarak kullanılabilir; önce çıktı formatı ve maliyet kapısı kararı gerekir." },
          ],
          composio: { configured: false, missingEnvNames: ["COMPOSIO_CONSUMER_API_KEY"], provider: "auto", accountHandle: "", toolkitVersion: "", readOnly: true, binding: null },
        },
      }),
  );
  await page.route(
    (url) => url.pathname === "/api/memory/knowledge",
    (route) =>
      route.fulfill({
        json: {
          success: true,
          knowledge: {
            accountHandle: "grafikcem",
            summary: "@grafikcem için 0 aktif yazım kuralı kullanıyorum.",
            activeFacts: [],
            proposals: [],
            performanceLessons: [],
            candidatePatterns: [],
            trainingCorpus: [],
            recentSignals: { counts: {}, neutralizedCount: 0, latest: [] },
            policy: { promotionMinEvidence: 3, note: "insan onayı" },
            sectionErrors: {},
          },
        },
      }),
  );
});

test.describe("Plan yüzeyleri gerçek", () => {
  test("Takvim: ay ızgarası + kanal filtresi + reels planı eylemi", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "plan-takvim");
    await waitSettled(page);
    await expect(page.getByTestId("takvim-view-month")).toBeVisible();
    await expect(page.getByTestId("takvim-channel-reels")).toBeVisible();
    await expect(page.getByTestId("takvim-plan-open")).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });

  test("Fırsatlar: kürasyon segmentleri (placeholder değil)", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "plan-firsatlar");
    // Race B: segment butonları FirsatlarTab skeleton'ının ALTINDA — önce settle.
    await waitSettled(page);
    await expect(page.getByTestId("opp-segment-all")).toBeVisible();
    await expect(page.getByTestId("opp-segment-news")).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });

  test("Seriler: DNA düzenle eylemi (placeholder değil)", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "plan-seriler");
    // Seri varsa DNA kartı + düzenle; en azından "Seri ekle" toolbar'ı görünür.
    await expect(page.getByText("Seriler", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });
});

test.describe("Kütüphane yüzeyleri gerçek", () => {
  test("Tümü: birleşik arama + tür segmentleri; '/' odak", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "lib-tumu");
    await waitSettled(page);
    await expect(page.getByTestId("lib-search")).toBeVisible();
    await expect(page.getByTestId("lib-type-all")).toBeVisible();
    await expect(page.getByTestId("lib-type-pattern")).toBeVisible();
    // "/" arama kutusuna odaklanır.
    await page.keyboard.press("/");
    await expect(page.getByTestId("lib-search")).toBeFocused();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });

  test("İlham: pano/capture yüzeyi (placeholder değil)", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "lib-ilham");
    // Boş durum: "İlk panoyu oluştur"; dolu: "Kaydet".
    await expect(page.getByText(/İlham|pano/i).first()).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });

  test("Öğrenme: durum sekmeleri (Gelen kutusu) veya kapalı-durum", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    await waitSettled(page);
    // Modül açıksa durum sekmeleri; kapalıysa dürüst blocked-external.
    const inbox = page.getByTestId("learn-tab-inbox");
    const url = page.getByTestId("learn-url");
    await expect(inbox.or(page.getByText(/Öğrenme modülü kapalı/))).toBeVisible();
    await expect(url.or(page.getByText(/Öğrenme modülü kapalı/))).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });
});

test.describe("Profil yüzeyleri gerçek", () => {
  test("CemOS'un bildikleri: kural ekle + bağlayıcı sözleşme (placeholder değil)", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "profile-memory");
    await expect(page.getByTestId("memory-add")).toBeVisible();
    // Faz 2B: bağlayıcı sözleşme cümlesi kaynaklı görünümün alt başlığında.
    await expect(page.getByText(/onaylanmadan hiçbir öneri taslakları etkilemez/)).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });

  test("Entegrasyonlar: env-code görünür, secret VALUE yok; X API blocked-external", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "profile-integrations");
    await waitSettled(page);
    await expect(page.getByTestId("integration-row-openrouter")).toBeVisible();
    // Env NAME code olarak; hiçbir yerde "sk-" gibi secret değeri yok.
    await expect(page.getByText("OPENROUTER_API_KEY").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("sk-");
    // X API kalıcı engelli + maliyet senaryosu.
    const xrow = page.getByTestId("integration-row-xapi");
    await expect(xrow).toBeVisible();
    // Tier-2 dürüst sınıflandırma: render motoru eksik; Vercel zorunlu ayrı-host engeli değil.
    const tier2 = page.getByTestId("integration-row-tier2_worker");
    await expect(tier2).toBeVisible();
    await expect(tier2).toContainText("Vercel Workflows");
    await expect(tier2).not.toContainText("ayrı deploy gerekir");
    await expect(xrow.getByText(/engelli/)).toBeVisible();
    await expect(xrow.getByText(/ödeme onayı/)).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });
});

test.describe("Erişim + taşma sözleşmeleri", () => {
  test("kullanıcı-erişilebilir hiçbir host yüzeyinde HostPlaceholder yok", async ({ page }) => {
    await page.goto("/");
    for (const tab of [
      "plan-takvim",
      "plan-firsatlar",
      "plan-seriler",
      "lib-tumu",
      "lib-ilham",
      "lib-ogrenme",
      "profile-memory",
      "profile-integrations",
    ]) {
      await selectTab(page, tab);
      await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
    }
  });

  test("1024 ve 1920'de yatay taşma yok (Kütüphane/Tümü geniş yüzey)", async ({ page }) => {
    for (const width of [1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await selectTab(page, "lib-tumu");
      await waitSettled(page);
      await expect(page.getByTestId("lib-search")).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
    }
  });
});

test.describe("Settled-state sözleşmesi (Faz 1D.1)", () => {
  // Loading state makul sürede KALKMALI ve yerine semantik bir success/empty/
  // error/blocked göstergesi gelmeli. Yalnız networkidle'a veya skeleton'ın
  // "bir an görünmesine" güvenilmez — kalkması doğrulanır. SETTLE_TIMEOUT +
  // waitSettled artık modül düzeyinde (aynı sinyali başarısız-testler de kullanır).

  const SURFACES: { tab: string; anchor: string }[] = [
    { tab: "plan-takvim", anchor: "takvim-view-month" },
    { tab: "plan-firsatlar", anchor: "opp-segment-all" },
    { tab: "lib-tumu", anchor: "lib-search" },
    { tab: "profile-integrations", anchor: "integration-row-openrouter" },
    { tab: "flow-radar", anchor: "radar-metrics" },
    { tab: "source-intelligence", anchor: "sis-metrics" },
  ];

  for (const { tab, anchor } of SURFACES) {
    test(`${tab}: skeleton makul sürede kalkar, settled göstergesi kalır`, async ({ page }) => {
      await page.goto("/");
      await selectTab(page, tab);
      await expect(page.getByTestId(anchor)).toBeVisible({ timeout: SETTLE_TIMEOUT });
      // Çekirdek regresyon: hiçbir skeleton sonsuza dek kalmaz.
      await expect(page.locator("[data-skeleton]")).toHaveCount(0, { timeout: SETTLE_TIMEOUT });
    });
  }

  test("lib-tumu: settled sonuç ya satır ya dürüst empty/error state", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "lib-tumu");
    await expect(page.locator("[data-skeleton]")).toHaveCount(0, { timeout: SETTLE_TIMEOUT });
    const row = page.locator('[data-testid^="lib-row-"]').first();
    const state = page.locator("[data-state]").first();
    await expect(row.or(state)).toBeVisible();
  });

  test("lib-ogrenme: settled sonuç metrik şeridi ya blocked-external", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "lib-ogrenme");
    await expect(page.locator("[data-skeleton]")).toHaveCount(0, { timeout: SETTLE_TIMEOUT });
    const metrics = page.getByTestId("learn-metrics");
    const blocked = page.locator('[data-state="blocked"]').first();
    await expect(metrics.or(blocked)).toBeVisible();
  });
});

test.describe("Advanced araştırma ekranları (Cmd+K, yeniden tasarlandı)", () => {
  test("Viral Radar: pipeline + sessiz metrik (8-KPI hero yok); placeholder yok", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "flow-radar");
    await waitSettled(page);
    await expect(page.getByRole("banner").getByText("Viral Radar")).toBeVisible();
    // Pipeline künye (arketip): Tara → Puanla → Karar Ver → Üret.
    await expect(page.getByText(/puanla/i).first()).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });

  test("X Hesabı Kaynakları: ölü 'Flow'a Gönder' butonu KALDIRILDI; placeholder yok", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "source-intelligence");
    await waitSettled(page);
    await expect(page.getByRole("banner").getByText("X Hesabı Kaynakları")).toBeVisible();
    // Sprint-9 ölü placeholder butonu (cursor:not-allowed) artık yok.
    await expect(page.getByText("Flow'a Gönder")).toHaveCount(0);
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });
});
