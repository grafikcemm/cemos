import type { Page } from "@playwright/test";

export type AreaId = "bugun" | "uret" | "kesfet" | "ogren" | "sosyal-medya";

/**
 * Sol sidebar'da bir birincil alan seçer, sonra o alanın SubNav'ından
 * ikincil sekmeyi açar. Tek-sekmeli alanlarda subLabel atlanır.
 */
export async function selectTab(page: Page, areaId: AreaId, subLabel?: string): Promise<void> {
  await page.getByTestId(`sidebar-area-${areaId}`).click();
  if (subLabel) {
    await page.getByRole("button", { name: subLabel, exact: true }).click();
  }
}

/**
 * Sol sidebar footer'ındaki yardımcı kümeden (Maliyet/Ayarlar/AI Sıralama)
 * bir utility sekmesi açar.
 */
export async function selectUtility(
  page: Page,
  tabId: "costs" | "settings" | "ai-rankings",
): Promise<void> {
  await page.getByTestId(`sidebar-utility-${tabId}`).click();
}
