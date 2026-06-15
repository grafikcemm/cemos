import { test, expect } from "@playwright/test";
import { selectTab } from "./helpers/nav";

// Hermetic smoke tests for the revision-tour features (low_score archive,
// Toolbox reachable from the Haber group). API responses are route-mocked so
// an empty DB passes — same philosophy as dashboard-smoke.spec.ts.

test("news pool offers the Düşük Skor archive filter", async ({ page }) => {
  await page.route("**/api/news-pool**", (route) =>
    route.fulfill({ json: { success: true, count: 0, items: [] } }),
  );

  await page.goto("/");
  await selectTab(page, "kesfet", "Haber Havuzu");
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

test("toolbox is reachable from the Haber group and platform groups are visible", async ({ page }) => {
  await page.route("**/api/toolbox**", (route) =>
    route.fulfill({ json: { success: true, items: [] } }),
  );

  await page.goto("/");
  // Sol sidebar 5 birincil alanı gösterir; Instagram + YouTube "Sosyal Medya" altında.
  await expect(page.getByTestId("sidebar-area-uret")).toHaveCount(1);
  await expect(page.getByTestId("sidebar-area-sosyal-medya")).toHaveCount(1);

  await selectTab(page, "uret", "Toolbox");

  await expect(page.getByRole("heading", { name: "Toolbox" })).toBeVisible();
  await expect(page.getByText("Araç bulunamadı.")).toBeVisible();
});
