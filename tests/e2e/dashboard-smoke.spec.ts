import { test, expect } from "@playwright/test";
import { selectTab, selectUtility } from "./helpers/nav";

// Data-independent smoke tests (TRAN-CODE-1.5): assert UI shells, navigation
// and loading placeholders — never row counts, so an empty DB also passes.

test("sidebar navigation reaches Keşif Motoru", async ({ page }) => {
  await page.goto("/");
  await selectTab(page, "discovery-engine");
  await expect(page.getByRole("heading", { name: "Keşif Motoru" })).toBeVisible();
});

test("daily-queue (absorbed) Bugün alanına iner", async ({ page }) => {
  // ABSORBED (v9): eski Günlük Kuyruk ekranı Bugün'e katlandı — ayrı yüzey yok.
  await page.goto("/");
  await selectTab(page, "daily-queue");
  await expect(page.getByRole("banner").getByText("Bugün", { exact: true })).toBeVisible();
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
  await selectTab(page, "flow-radar");

  // Faz 1D.1: sessiz MetricStrip hücresi (data-metric="Toplam aday") başlangıç
  // yüklemesinde de render eder; summary null → "–". Sözleşme aynı: yüklenirken
  // sahte 0 yok.
  const totalCard = page.locator('[data-metric="Toplam aday"]');
  await expect(totalCard).toBeVisible();
  // While the fetch is gated the widget must show the dash placeholder —
  // never a misleading hard "0".
  await expect(totalCard).toContainText("–");
  await expect(totalCard).not.toContainText(/^0/);

  releaseResponse();
  // After the response lands the placeholders resolve to the real numbers.
  await expect(totalCard).toContainText("5", { timeout: 20_000 });
  await expect(totalCard).not.toContainText("–", { timeout: 20_000 });
});

test("settings tab renders health cards and the learning status card", async ({ page }) => {
  // Hermetik: /api/health canlı OpenRouter/Buffer probe'ları koşar ve soğuk
  // sunucuda 30-40s sürebilir — sabit sağlıklı fixture ile mock'lanır.
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        openrouter: { configured: true, ok: true },
        socialdata: { configured: true, ok: true },
        buffer: { configured: false, ok: true },
        database: { ok: true },
        worker: { mode: "worker", inferredStatus: "recent_tick" },
      },
    }),
  );

  await page.goto("/");
  await selectUtility(page, "settings");
  await expect(page.getByText("Ayarlar & Sağlık")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("ÖĞRENME DURUMU", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
});

// ── Deep-link'ler: yalnız URL değil DOĞRU BAŞLIK; persisted activeTab
//    FARKLIYKEN de route'un sekmesi kazanmalı. ────────────────────────────
// Legacy deep-link'ler yeni evlerine iner (ABSORBED) ya da advanced kalır.
const DEEP_LINKS: { path: string; crumb: string }[] = [
  { path: "/dashboard/daily-queue", crumb: "Bugün" }, // absorbed → morning
  { path: "/dashboard/flow-radar", crumb: "Viral Radar" }, // advanced
  { path: "/dashboard/pattern-library", crumb: "Tümü" }, // absorbed → lib-tumu
  { path: "/dashboard/source-intelligence", crumb: "X Hesabı Kaynakları" }, // advanced
];

for (const { path, crumb } of DEEP_LINKS) {
  test(`deep-link ${path} seeds its tab even with a different persisted activeTab`, async ({
    page,
  }) => {
    // Önce farklı bir sekmeye git → activeTab persist edilsin.
    await page.goto("/");
    await selectUtility(page, "costs");
    await expect(page.getByRole("banner").getByText("Maliyet", { exact: true })).toBeVisible();

    // Deep-link route persisted state'i ezmeli (seed-once davranışı).
    await page.goto(path);
    await expect(page.getByRole("banner").getByText(crumb)).toBeVisible({ timeout: 20_000 });
  });
}
