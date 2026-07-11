import { test, expect } from "@playwright/test";

// Shell etkileşim smoke'ları: Cmd-K, sidebar collapse, mobil bottom-nav +
// sheet, sistem durum drawer'ı, edit-gate. Hepsi hermetik/mutasyonsuz.

test("Cmd-K palette navigates to Maliyetler", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const input = page.getByLabel("Ekran ara");
  await expect(input).toBeVisible();
  await input.fill("maliyet");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("banner").getByText("Maliyetler")).toBeVisible();
});

test("sidebar collapses to icon rail and expands back", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator(".app-sidebar");
  await page.getByRole("button", { name: "Menüyü daralt" }).click();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
    .toBeLessThan(100);
  // Alan butonları rail'de de tıklanabilir olmalı.
  await expect(page.getByTestId("sidebar-area-kesif")).toBeVisible();
  await page.getByRole("button", { name: "Menüyü genişlet" }).click();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
    .toBeGreaterThan(180);
});

test("mobile bottom nav switches area; re-tap opens sub-page sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  // Alan değiştir
  await page.getByTestId("bottomnav-uretim").click();
  await expect(page.getByRole("banner").getByText("Üretim")).toBeVisible();
  // Aktif alana tekrar dokun → sheet
  await page.getByTestId("bottomnav-uretim").click();
  await expect(page.getByTestId("sheet-tab-youtube")).toBeVisible();
  await page.getByTestId("sheet-tab-youtube").click();
  await expect(page.getByRole("banner").getByText("YouTube Fırsat Motoru")).toBeVisible();
});

test("Sistem page opens from Maliyetler (utility nav regression)", async ({ page }) => {
  // Prod bug 2026-07-11: costs'tayken sidebar Sistem'e tıklamak "son ziyaret
  // edilen utility" remap'ine takılıp içeriği Maliyetler'de bırakıyordu.
  await page.goto("/");
  await page.getByTestId("sidebar-utility-costs").click();
  await expect(page.getByRole("banner").getByText("Maliyetler")).toBeVisible();

  await page.getByTestId("sidebar-utility-system").click();
  await expect(page.getByRole("banner").getByText("Sistem", { exact: true })).toBeVisible();
  await expect(page.getByTestId("sidebar-utility-system")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("banner").getByText("Maliyetler")).toHaveCount(0);
});

test("system status button opens the problem drawer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Sistem durumu/ }).click();
  await expect(page.getByText("Sistem Durumu")).toBeVisible();
  await expect(page.getByText("Bugünkü maliyet")).toBeVisible();
});

test("edit-gate: publish disabled until the operator edits the AI text", async ({ page }) => {
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
  await page.getByTestId("sidebar-tab-morning").click();

  const publishBtn = page.getByRole("button", { name: /Manuel Paylaşıldı/ });
  await expect(publishBtn).toBeVisible({ timeout: 20_000 });
  await expect(publishBtn).toBeDisabled();
  await expect(page.getByText("AI çıktısını kendi sesinle düzenlemeden yayınlayamazsın.")).toBeVisible();

  // Operatör düzenleyince gate açılır.
  const textarea = page.locator("textarea").first();
  await textarea.fill("Kendi sesimle yeniden yazılmış taslak metni.");
  await expect(publishBtn).toBeEnabled();
});
