import { test, expect } from "@playwright/test";

// Shell etkileşim smoke'ları (rebuild 3-görevli IA): sidebar 3 alan + Toolbox +
// Profil, Plan/Kütüphane subnav, Profil menü, Cmd-K, mobil 3+1 sheet, sistem
// drawer, edit-gate. Hepsi hermetik/mutasyonsuz. globalSetup ile kimlikli koşar.

test("sidebar: 3 TOP-LEVEL + Araştırma grubu + Toolbox + Profil (ADR-040; absorbed legacy adı yok)", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator(".app-sidebar");
  await expect(page.getByTestId("sidebar-area-bugun")).toBeVisible();
  await expect(page.getByTestId("sidebar-area-plan")).toBeVisible();
  await expect(page.getByTestId("sidebar-area-kutuphane")).toBeVisible();
  await expect(page.getByTestId("sidebar-toolbox")).toBeVisible();
  await expect(page.getByTestId("sidebar-profile")).toBeVisible();
  // ADR-040: araştırma ekranları (Haberler/YouTube/Viral Radar/Keşif/X Kaynakları)
  // artık sidebar'da hiyerarşik "Araştırma" grubunda keşfedilebilir — saklı DEĞİL.
  await expect(page.getByTestId("sidebar-research-toggle")).toBeVisible();
  await expect(page.getByTestId("sidebar-research-flow-radar")).toBeVisible();
  await expect(page.getByTestId("sidebar-research-discovery-engine")).toBeVisible();
  // ABSORBED legacy grup/ekran adları ana navda görünmemeli (yeni evlerine alias'landı).
  for (const legacy of ["Viral Kütüphane", "Günlük Kuyruk", "Instagram", "Üretim", "Hafıza"]) {
    await expect(sidebar.getByText(legacy, { exact: true })).toHaveCount(0);
  }
});

test("hesap değiştirici (§8F): non-modal popover; Escape kapatır + focus döner; kanal değişir", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sidebar-area-bugun")).toBeVisible();
  const trigger = page.getByTestId("sidebar-account");
  await trigger.click();
  const switcher = page.getByTestId("account-switcher");
  await expect(switcher).toBeVisible();
  // Non-modal: marka/sidebar/workspace görünür kalır (modal scrim YOK).
  await expect(page.locator(".app-sidebar")).toBeVisible();
  await expect(page.getByTestId("sidebar-area-bugun")).toBeVisible();
  await expect(switcher.getByTestId("account-option-grafikcem")).toBeVisible();
  await expect(switcher.getByTestId("account-option-maskulenkod")).toBeVisible();
  // Escape kapatır + focus tetikleyiciye döner (§8F).
  await page.keyboard.press("Escape");
  await expect(switcher).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // Yeniden aç + kanal değiştir.
  await trigger.click();
  await page.getByTestId("account-option-maskulenkod").click();
  await expect(page.getByTestId("sidebar-account")).toContainText("@maskulenkod");
});

test("Plan alanı subnav ile açılır ve Fırsatlar'a geçer", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sidebar-area-plan").click();
  await expect(page.getByRole("banner").getByText("Plan", { exact: true })).toBeVisible();
  await expect(page.getByTestId("subnav-tab-plan-takvim")).toBeVisible();
  await page.getByTestId("subnav-tab-plan-firsatlar").click();
  await expect(page.getByRole("banner").getByText("Fırsatlar")).toBeVisible();
  // Faz 1D: gerçek Fırsatlar yüzeyi (placeholder değil) — segment filtresi görünür.
  await expect(page.getByTestId("opp-segment-all")).toBeVisible();
});

test("Kütüphane alanı Tümü host'unu açar", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sidebar-area-kutuphane").click();
  await expect(page.getByRole("banner").getByText("Kütüphane", { exact: true })).toBeVisible();
  await expect(page.getByTestId("subnav-tab-lib-tumu")).toBeVisible();
  await expect(page.getByTestId("subnav-tab-lib-ogrenme")).toBeVisible();
  // Faz 1D: gerçek Kütüphane/Tümü yüzeyi (placeholder değil) — birleşik arama kutusu.
  await expect(page.getByTestId("lib-search")).toBeVisible();
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

test("Cmd-K advanced araştırma ekranını açar (Araştırma / Viral Radar; sidebar'da highlight)", async ({ page }) => {
  await page.goto("/");
  // Cmd-K dinleyicisi hydration'da bağlanır → önce shell'in hazır olduğunu bekle.
  await expect(page.getByTestId("sidebar-area-bugun")).toBeVisible();
  await page.keyboard.press("Control+k");
  const input = page.getByLabel("Ekran ara");
  await expect(input).toBeVisible();
  await input.fill("viral radar");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("banner").getByText("Viral Radar")).toBeVisible();
  // ADR-040: advanced ekran artık kendi "Araştırma" grup öğesini highlight eder
  // (eski davranış: Plan alanını highlight ederdi).
  await expect(page.getByTestId("sidebar-research-flow-radar")).toHaveAttribute("aria-current", "page");
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
