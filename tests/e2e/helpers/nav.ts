import type { Page } from "@playwright/test";

export type AreaId = "bugun" | "uretim" | "kesif" | "hafiza";

/**
 * Sol sidebar'da bir birincil alan seçer (yalnız 5 alan görünür), sonra
 * workspace içi contextual sub-nav'dan ikincil sayfayı açar.
 */
export async function selectTab(page: Page, areaId: AreaId, subLabel?: string): Promise<void> {
  await page.getByTestId(`sidebar-area-${areaId}`).click();
  if (subLabel) {
    await page.getByRole("tab", { name: subLabel, exact: true }).click();
  }
}

/**
 * Sistem alanını açar (sidebar 5. öğe) ve sub-nav'dan utility sayfasını seçer.
 */
export async function selectUtility(
  page: Page,
  tabId: "toolbox" | "costs" | "system" | "settings",
): Promise<void> {
  await page.getByTestId("sidebar-area-sistem").click();
  await page.getByTestId(`subnav-tab-${tabId}`).click();
}
