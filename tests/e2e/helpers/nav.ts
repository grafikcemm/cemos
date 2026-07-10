import type { Page } from "@playwright/test";

export type AreaId = "bugun" | "uretim" | "kesif" | "hafiza";

/**
 * Sol sidebar'da bir birincil alan seçer, sonra o alanın sub-tab listesinden
 * ikincil sekmeyi açar. Tek-sekmeli alanlarda subLabel atlanır.
 */
export async function selectTab(page: Page, areaId: AreaId, subLabel?: string): Promise<void> {
  await page.getByTestId(`sidebar-area-${areaId}`).click();
  if (subLabel) {
    await page.getByRole("button", { name: subLabel, exact: true }).click();
  }
}

/**
 * Sol sidebar'daki Sistem kümesinden (Toolbox/Maliyetler/Sistem/Ayarlar)
 * bir utility sekmesi açar.
 */
export async function selectUtility(
  page: Page,
  tabId: "toolbox" | "costs" | "system" | "settings",
): Promise<void> {
  await page.getByTestId(`sidebar-utility-${tabId}`).click();
}
