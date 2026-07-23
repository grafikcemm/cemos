import { test, expect, type Page } from "./fixtures";
import { selectTab } from "./helpers/nav";

/**
 * Denetim 2026-07-23 — dürüst-durum regresyonları (production sözleşmesi):
 *  1. DB-hatasında kalan fake-zero rozetleri: Kütüphane/Tümü "Tümü 0",
 *     Öğrenme sekme sayaçları, YouTube "Fırsat Akışı 0" → sorgu başarısızsa
 *     sayaç GİZLİ; "0" yalnız başarılı gerçek-boş cevabın sonucudur.
 *  2. PR#9 review HIGH'ları: İlham channelUnknown → dürüst ErrorState (blank
 *     değil); YouTube paylaşımlı loadError — feed hatası sonrası BAŞARILI
 *     kanal yüklemesi maskelenmez.
 *  3. Ayarlar → Hafıza Önerileri "Kural hesabı": non-dirty formda global hesabı
 *     TAKİP eder; dirty'de korunur + hedef "şu hesaba eklenecek" satırıyla
 *     görünür, global'den sapınca alert tonu.
 * HERMETİK: tüm API'ler route-mock; canlı DB yok.
 */

const ACCOUNTS = [
  { id: "acc-g", handle: "grafikcem" },
  { id: "acc-m", handle: "maskulenkod" },
];

async function mockSettings(page: Page) {
  await page.route("**/api/settings", (route) =>
    route.fulfill({ json: { success: true, accounts: ACCOUNTS, models: [], modelProfile: "operator_quality" } }),
  );
}

const DB503 = { status: 503, json: { success: false, error: "Veritabanına şu anda erişilemiyor.", code: "db_unavailable", retryable: true } };

test("Kütüphane/Tümü: arama 503 → ErrorState + 'Tümü 0' rozeti YOK", async ({ page }) => {
  await mockSettings(page);
  await page.route("**/api/library/search**", (route) => route.fulfill(DB503));
  await page.goto("/");
  await selectTab(page, "lib-tumu");
  await expect(page.getByText("Arama yüklenemedi")).toBeVisible();
  // Fake-zero yasak: başarısız sorguda "Tümü 0" birleşimi hiçbir yerde yok.
  await expect(page.locator("text=/Tümü\\s*0/")).toHaveCount(0);
});

test("Öğrenme: kaynaklar 503 → sekme sayaçları GİZLİ (0 rozetleri yok) + dürüst hata", async ({ page }) => {
  await mockSettings(page);
  await page.route("**/api/learn/sources", (route) =>
    route.request().method() === "GET" ? route.fulfill(DB503) : route.fallback(),
  );
  await page.goto("/");
  await selectTab(page, "lib-ogrenme");
  await expect(page.getByText("Öğrenme verisi alınamadı")).toBeVisible();
  for (const tab of ["inbox", "learning", "ready"]) {
    const btn = page.getByTestId(`learn-tab-${tab}`);
    await expect(btn).toBeVisible();
    await expect(btn.locator("span.tnum")).toHaveCount(0); // sayaç gizli — "0" değil
  }
});

test("YouTube: feed 503 → 'Fırsat Akışı' rozeti YOK + hata; ardından Kanallar BAŞARILI yüklenir (paylaşılan-bayrak reset regresyonu)", async ({ page }) => {
  await mockSettings(page);
  await page.route("**/api/youtube/videos**", (route) => route.fulfill(DB503));
  await page.route("**/api/youtube/channels", (route) =>
    route.fulfill({
      json: {
        success: true,
        configured: true,
        competitors: [
          { channelId: "ch-1", title: "Rakip Kanal", handle: "@rakip", enabled: true, videoCount: 12, subscriberCount: 1000 },
        ],
        suggestions: [],
      },
    }),
  );
  await page.goto("/");
  await selectTab(page, "youtube");
  await expect(page.getByText("Bir şeyler ters gitti").or(page.locator('[data-state="error"]')).first()).toBeVisible();
  await expect(page.getByTestId("subnav-tab-feed")).not.toContainText("0"); // rozet gizli
  // Kanallar'a geç: feed'in eski hatası BAŞARILI kanal yüklemesini maskeleyemez.
  await page.getByTestId("subnav-tab-channels").click();
  await expect(page.getByText("Rakip Kanallar").first()).toBeVisible();
  await expect(page.getByText("Kanallar alınamadı")).toHaveCount(0);
});

test("İlham: bayat persist channel (listede yok) → BLANK değil 'Aktif hesap çözümlenemedi' (PR#9 HIGH-1 regresyonu)", async ({ page }) => {
  await mockSettings(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "xagent-store",
      JSON.stringify({ state: { activeTab: "lib-ilham", activeChannel: "pixelspor", savedTweets: [], newsItems: [] }, version: 9 }),
    );
  });
  await page.goto("/");
  await expect(page.getByText("Aktif hesap çözümlenemedi")).toBeVisible();
});

test("Ayarlar/Hafıza Önerileri: hedef hesap non-dirty'de global'i izler; dirty'de korunur + sapma uyarısı görünür", async ({ page }) => {
  await mockSettings(page);
  await page.route("**/api/memory/proposals", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { success: true, proposals: [], active: [] } })
      : route.fallback(),
  );
  await page.route("**/api/costs**", (route) => route.fulfill(DB503));
  await page.route("**/api/health**", (route) =>
    route.fulfill({ json: { degraded: false, database: { ok: true }, openrouter: { configured: true, ok: true }, socialdata: { configured: true, ok: true }, worker: { mode: "cron", inferredStatus: "recent_tick" }, contracts: null } }),
  );
  await page.goto("/");
  await selectTab(page, "settings");
  const target = page.getByLabel("Kural hesabı");
  await expect(target).toHaveValue("grafikcem");
  await expect(page.getByTestId("proposal-target-notice")).toContainText("@grafikcem hesabına eklenecek");

  // NON-DIRTY: sidebar'dan hesap değiştir → hedef TAKİP eder.
  await page.getByTestId("sidebar-account").click();
  await page.getByTestId("account-option-maskulenkod").click();
  await expect(target).toHaveValue("maskulenkod");

  // DIRTY: kural yazılıyken geri değiştir → hedef KORUNUR + belirgin sapma uyarısı.
  await page.getByPlaceholder(/Kuralını yaz/).fill("Emoji kullanma, kısa vurucu cümleler");
  await page.getByTestId("sidebar-account").click();
  await page.getByTestId("account-option-grafikcem").click();
  await expect(target).toHaveValue("maskulenkod"); // yazarken hedef sıfırlanmadı
  const notice = page.getByTestId("proposal-target-notice");
  await expect(notice).toContainText("@maskulenkod hesabına eklenecek");
  await expect(notice).toContainText("DEĞİL"); // globalden sapma vurgusu
  await expect(notice).toHaveAttribute("role", "alert");
});
