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

test("morning dashboard renders the viral news section", async ({ page }) => {
  await page.route("**/api/news-pool**", (route) =>
    route.fulfill({ json: { success: true, count: 0, items: [] } }),
  );

  await page.goto("/");
  await page.getByTestId("sidebar-area-bugun").click();
  // Header renders regardless of data (empty state is inside the section).
  await expect(page.getByText("Viral Haber Öne Çıkanlar")).toBeVisible({ timeout: 20_000 });
});

test("toolbox is reachable from the Sistem cluster and task areas are visible", async ({ page }) => {
  await page.route("**/api/toolbox**", (route) =>
    route.fulfill({ json: { success: true, items: [] } }),
  );

  await page.goto("/");
  // Sol sidebar 4 birincil alanı gösterir (Bugün/Üretim/Keşif/Hafıza).
  await expect(page.getByTestId("sidebar-area-bugun")).toHaveCount(1);
  await expect(page.getByTestId("sidebar-area-uretim")).toHaveCount(1);
  await expect(page.getByTestId("sidebar-area-kesif")).toHaveCount(1);
  await expect(page.getByTestId("sidebar-area-hafiza")).toHaveCount(1);

  await selectUtility(page, "toolbox");

  await expect(page.getByRole("heading", { name: "Toolbox" })).toBeVisible();
  await expect(page.getByText("Araç bulunamadı.")).toBeVisible();
});
