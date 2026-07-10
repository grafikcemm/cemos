import { test, expect } from "@playwright/test";
import { selectTab, selectUtility } from "./helpers/nav";

// Data-independent smoke tests (TRAN-CODE-1.5): assert UI shells, navigation
// and loading placeholders — never row counts, so an empty DB also passes.

test("topbar navigation from a dashboard page returns to the app shell (TRAN-KPI-1.1)", async ({
  page,
}) => {
  await page.goto("/dashboard/weekly-learning-report");
  await selectTab(page, "kesif", "Keşif Motoru");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Keşif Motoru" })).toBeVisible();
});

test("daily queue tab shows today's operation panel", async ({ page }) => {
  await page.goto("/");
  await selectTab(page, "bugun", "Günlük Kuyruk");
  await expect(page.getByText("Bugünkü Operasyon")).toBeVisible();
});

test("viral radar shows placeholders, never a false zero, while loading (TRAN-KPI-1.3)", async ({
  page,
}) => {
  // Hold the flow-radar response so the loading state is deterministic, then
  // fulfill with a fixed payload — hermetic, independent of DB contents.
  let releaseResponse: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/growth/flow-radar**", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        success: true,
        candidates: [],
        summary: {
          totalCandidates: 5,
          highOpportunity: 1,
          highRisk: 0,
          tweetCandidates: 2,
          quoteCandidates: 1,
          replyCandidates: 1,
          ignored: 0,
          averageOpportunityScore: 42,
        },
      },
    });
  });

  await page.goto("/");
  await selectTab(page, "kesif", "Viral Radar");

  const totalCard = page
    .locator("div")
    .filter({ hasText: /^Toplam Aday/ })
    .first();
  await expect(totalCard).toBeVisible();
  // While the fetch is gated the widget must show the dash placeholder —
  // never a misleading hard "0".
  await expect(totalCard).toContainText("–");
  await expect(totalCard).not.toContainText(/Toplam Aday0/);

  releaseResponse();
  // After the response lands the placeholders resolve to the real numbers.
  await expect(totalCard).toContainText("5", { timeout: 20_000 });
  await expect(totalCard).not.toContainText("–", { timeout: 20_000 });
});

test("settings tab renders health cards and the learning status card", async ({ page }) => {
  await page.goto("/");
  await selectUtility(page, "settings");
  // The settings load runs live health checks (OpenRouter/Buffer) — generous
  // timeout for cold dev servers.
  await expect(page.getByText("Ayarlar & Sağlık")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("ÖĞRENME DURUMU", { exact: false })).toBeVisible({
    timeout: 30_000,
  });
});

test("weekly learning report page loads without a runtime error", async ({ page }) => {
  await page.goto("/dashboard/weekly-learning-report");
  await expect(page.getByText("CemOS").first()).toBeVisible();
  // <nextjs-portal> always exists in dev (devtools indicator) — assert no
  // actual error dialog text instead.
  await expect(page.getByText(/Unhandled Runtime Error|Application error/)).toHaveCount(0);
});
