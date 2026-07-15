import { test, expect } from "@playwright/test";

// Shell etkileşim smoke'ları (rebuild 3-görevli IA): sidebar 3 alan + Toolbox +
// Profil, Plan/Kütüphane subnav, Profil menü, Cmd-K, mobil 3+1 sheet, sistem
// drawer, edit-gate. Hepsi hermetik/mutasyonsuz. globalSetup ile kimlikli koşar.

test("sidebar yalnız 3 görev + Toolbox + Profil gösterir (legacy motor adı yok)", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator(".app-sidebar");
  await expect(page.getByTestId("sidebar-area-bugun")).toBeVisible();
  await expect(page.getByTestId("sidebar-area-plan")).toBeVisible();
  await expect(page.getByTestId("sidebar-area-kutuphane")).toBeVisible();
  await expect(page.getByTestId("sidebar-toolbox")).toBeVisible();
  await expect(page.getByTestId("sidebar-profile")).toBeVisible();
  // Legacy motor/ekran adları ana navda görünmemeli.
  for (const legacy of ["Viral Kütüphane", "Keşif Motoru", "Günlük Kuyruk", "Instagram", "Üretim", "Keşif", "Hafıza"]) {
    await expect(sidebar.getByText(legacy, { exact: true })).toHaveCount(0);
  }
});

test("Plan alanı subnav ile açılır ve Fırsatlar'a geçer", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sidebar-area-plan").click();
  await expect(page.getByRole("banner").getByText("Plan", { exact: true })).toBeVisible();
  await expect(page.getByTestId("subnav-tab-plan-takvim")).toBeVisible();
  await page.getByTestId("subnav-tab-plan-firsatlar").click();
  await expect(page.getByRole("banner").getByText("Fırsatlar")).toBeVisible();
  await expect(page.getByTestId("host-placeholder")).toBeVisible();
});

test("Kütüphane alanı Tümü host'unu açar", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sidebar-area-kutuphane").click();
  await expect(page.getByRole("banner").getByText("Kütüphane", { exact: true })).toBeVisible();
  await expect(page.getByTestId("subnav-tab-lib-tumu")).toBeVisible();
  await expect(page.getByTestId("subnav-tab-lib-ogrenme")).toBeVisible();
  await expect(page.getByTestId("host-placeholder")).toBeVisible();
});

test("Profil menüsü açılır; Sistem ve Maliyet profil yüzeyleridir (ana navda değil)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sidebar-profile").click();
  const menu = page.getByTestId("profile-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId("profile-item-profile-memory")).toBeVisible();
  await expect(menu.getByTestId("profile-item-system")).toBeVisible();
  await expect(menu.getByTestId("profile-logout")).toBeVisible();

  await menu.getByTestId("profile-item-system").click();
  await expect(page.getByRole("banner").getByText("Sistem", { exact: true })).toBeVisible();
  // Profil subnav ile Maliyet'e yatay geçiş.
  await page.getByTestId("subnav-tab-costs").click();
  await expect(page.getByRole("banner").getByText("Maliyet", { exact: true })).toBeVisible();
});

test("Cmd-K advanced araştırma ekranını açar (Viral Radar → Plan / Viral Radar)", async ({ page }) => {
  await page.goto("/");
  // Cmd-K dinleyicisi hydration'da bağlanır → önce shell'in hazır olduğunu bekle.
  await expect(page.getByTestId("sidebar-area-bugun")).toBeVisible();
  await page.keyboard.press("Control+k");
  const input = page.getByLabel("Ekran ara");
  await expect(input).toBeVisible();
  await input.fill("viral radar");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("banner").getByText("Viral Radar")).toBeVisible();
  // Advanced ekran araştırma ebeveyni Plan'ı highlight eder.
  await expect(page.getByTestId("sidebar-area-plan")).toHaveAttribute("aria-current", "page");
});

test("mobil bottom nav 3+1: alan geç, re-tap sheet, Profil sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("bottomnav-bugun")).toBeVisible();
  await expect(page.getByTestId("bottomnav-profil")).toBeVisible();

  await page.getByTestId("bottomnav-plan").click();
  await expect(page.getByRole("banner").getByText("Plan", { exact: true })).toBeVisible();
  // Aktif alana tekrar dokun → alt sayfa sheet.
  await page.getByTestId("bottomnav-plan").click();
  await expect(page.getByTestId("sheet-tab-plan-seriler")).toBeVisible();
  await page.getByTestId("sheet-tab-plan-seriler").click();
  await expect(page.getByRole("banner").getByText("Seriler")).toBeVisible();

  // Profil sheet 5 yüzey + Çıkış.
  await page.getByTestId("bottomnav-profil").click();
  await expect(page.getByTestId("sheet-profile-system")).toBeVisible();
  await expect(page.getByTestId("sheet-profile-logout")).toBeVisible();
});

test("sistem durum butonu sorun drawer'ını açar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Sistem durumu/ }).click();
  await expect(page.getByText("Sistem Durumu")).toBeVisible();
  await expect(page.getByText("Bugünkü maliyet")).toBeVisible();
});

test("edit-gate: operatör AI metnini düzenlemeden yayınlayamaz", async ({ page }) => {
  // Hermetik: kuyruk fixture'ı — publish tıklanmaz, mutasyon yok.
  await page.route("**/api/growth/daily-queue**", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      json: {
        success: true,
        items: [
          {
            id: "e2e-draft-1",
            accountId: "acc-1",
            content: "AI tarafından üretilen örnek taslak metni.",
            editedContent: null,
            draftType: "tweet",
            mode: "quick",
            status: "draft",
            accountHandle: "grafikcem",
            displayName: "Grafikcem",
            createdAt: new Date("2026-07-10T06:00:00Z").toISOString(),
            lintReport: null,
            generatedImageUrl: null,
          },
        ],
      },
    });
  });

  await page.goto("/");
  await page.getByTestId("sidebar-area-bugun").click();

  const publishBtn = page.getByRole("button", { name: /Manuel Paylaşıldı/ });
  await expect(publishBtn).toBeVisible({ timeout: 20_000 });
  await expect(publishBtn).toBeDisabled();
  await expect(page.getByText("AI çıktısını kendi sesinle düzenlemeden yayınlayamazsın.")).toBeVisible();

  const textarea = page.locator("textarea").first();
  await textarea.fill("Kendi sesimle yeniden yazılmış taslak metni.");
  await expect(publishBtn).toBeEnabled();
});
