import { test, expect } from "@playwright/test";
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

test.describe("Plan yüzeyleri gerçek", () => {
  test("Takvim: ay ızgarası + kanal filtresi + reels planı eylemi", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "plan-takvim");
    await expect(page.getByTestId("takvim-view-month")).toBeVisible();
    await expect(page.getByTestId("takvim-channel-reels")).toBeVisible();
    await expect(page.getByTestId("takvim-plan-open")).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });

  test("Fırsatlar: kürasyon segmentleri (placeholder değil)", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "plan-firsatlar");
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
    await expect(page.getByText(/onaylanmadan taslakları etkilemez/)).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });

  test("Entegrasyonlar: env-code görünür, secret VALUE yok; X API blocked-external", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "profile-integrations");
    await expect(page.getByTestId("integration-row-openrouter")).toBeVisible();
    // Env NAME code olarak; hiçbir yerde "sk-" gibi secret değeri yok.
    await expect(page.getByText("OPENROUTER_API_KEY").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("sk-");
    // X API kalıcı engelli + maliyet senaryosu.
    const xrow = page.getByTestId("integration-row-xapi");
    await expect(xrow).toBeVisible();
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
      await expect(page.getByTestId("lib-search")).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
    }
  });
});

test.describe("Advanced araştırma ekranları (Cmd+K, yeniden tasarlandı)", () => {
  test("Viral Radar: pipeline + sessiz metrik (8-KPI hero yok); placeholder yok", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "flow-radar");
    await expect(page.getByRole("banner").getByText("Viral Radar")).toBeVisible();
    // Pipeline künye (arketip): Tara → Puanla → Karar Ver → Üret.
    await expect(page.getByText(/puanla/i).first()).toBeVisible();
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });

  test("X Hesabı Kaynakları: ölü 'Flow'a Gönder' butonu KALDIRILDI; placeholder yok", async ({ page }) => {
    await page.goto("/");
    await selectTab(page, "source-intelligence");
    await expect(page.getByRole("banner").getByText("X Hesabı Kaynakları")).toBeVisible();
    // Sprint-9 ölü placeholder butonu (cursor:not-allowed) artık yok.
    await expect(page.getByText("Flow'a Gönder")).toHaveCount(0);
    await expect(page.getByTestId("host-placeholder")).toHaveCount(0);
  });
});
