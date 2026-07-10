import { test, expect } from "@playwright/test";
import { selectTab, selectUtility } from "./helpers/nav";

// Hermetic smoke tests for the revision-tour features (low_score archive,
// Toolbox reachable from the Sistem cluster). API responses are route-mocked so
// an empty DB passes — same philosophy as dashboard-smoke.spec.ts.

test("news pool offers the Düşük Skor archive filter", async ({ page }) => {
  await page.route("**/api/news-pool**", (route) =>
    route.fulfill({ json: { success: true, count: 0, items: [] } }),
  );

  await page.goto("/");
  await selectTab(page, "bugun", "Haberler");
  await expect(page.getByRole("heading", { name: "Haber Havuzu" })).toBeVisible();

  // The status dropdown must expose the archived statuses explicitly.
  await expect(page.locator("option", { hasText: "Düşük Skor" })).toHaveCount(1);
  await expect(page.locator("option", { hasText: "Karantina" })).toHaveCount(1);
});

test("morning dashboard renders the viral news section behind the fold toggle", async ({ page }) => {
  await page.route("**/api/news-pool**", (route) =>
    route.fulfill({ json: { success: true, count: 0, items: [] } }),
  );

  await page.goto("/");
  await page.getByTestId("sidebar-area-bugun").click();
  await page.getByTestId("subnav-tab-morning").click();
  // "Tepki vermeye değer" varsayılan katlanmış — aç, sonra bölümü doğrula.
  await page.getByRole("button", { name: /Tepki vermeye değer/ }).click();
  await expect(page.getByText("Viral Haber Öne Çıkanlar")).toBeVisible({ timeout: 20_000 });
});

test("toolbox is reachable from the Sistem cluster and 5 areas are visible", async ({ page }) => {
  await page.route("**/api/toolbox**", (route) =>
    route.fulfill({ json: { success: true, items: [] } }),
  );

  await page.goto("/");
  // Sol sidebar 5 alanı gösterir (Bugün/Üretim/Keşif/Hafıza/Sistem) — alt
  // sayfalar sidebar'da SERGİLENMEZ (workspace sub-nav'da yaşar).
  for (const id of ["bugun", "uretim", "kesif", "hafiza", "sistem"]) {
    await expect(page.getByTestId(`sidebar-area-${id}`)).toHaveCount(1);
  }
  await expect(page.getByTestId("subnav-tab-daily-queue")).toHaveCount(1); // aktif alanın sub-nav'ı
  await expect(page.locator('[data-testid^="sidebar-tab-"]')).toHaveCount(0); // sidebar'da alt sekme yok

  await selectUtility(page, "toolbox");

  await expect(page.getByRole("heading", { name: "Toolbox" })).toBeVisible();
  await expect(page.getByText("Bu grupta araç yok")).toBeVisible();
});
