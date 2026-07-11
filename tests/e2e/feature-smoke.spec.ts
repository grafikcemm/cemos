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
  await selectTab(page, "news-pool");
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
  await selectTab(page, "morning");
  // "Tepki vermeye değer" varsayılan katlanmış — aç, sonra bölümü doğrula.
  await page.getByRole("button", { name: /Tepki vermeye değer/ }).click();
  await expect(page.getByText("Viral Haber Öne Çıkanlar")).toBeVisible({ timeout: 20_000 });
});

test("toolbox is reachable from the Sistem group in the full sidebar", async ({ page }) => {
  await page.route("**/api/toolbox**", (route) =>
    route.fulfill({ json: { success: true, items: [] } }),
  );

  await page.goto("/");
  // Dolu sidebar: en üstte kategorisiz direkt öğeler + grup altı sayfalar.
  for (const id of ["morning", "news-pool", "daily-queue", "instagram", "flow-radar", "viral-library"]) {
    await expect(page.getByTestId(`sidebar-tab-${id}`)).toHaveCount(1);
  }
  // Grup başlıkları eyebrow olarak görünür; workspace sub-nav artık yok.
  // ("Sistem" hem grup başlığı hem utility sekmesi — first() strict-mode'u aşar.)
  const sidebar = page.locator(".app-sidebar");
  for (const label of ["Üretim", "Keşif", "Hafıza", "Sistem"]) {
    await expect(sidebar.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.locator('[data-testid^="subnav-tab-"]')).toHaveCount(0);

  await selectUtility(page, "toolbox");

  await expect(page.getByRole("heading", { name: "Toolbox" })).toBeVisible();
  await expect(page.getByText("Bu grupta araç yok")).toBeVisible();
});
