import type { Page } from "@playwright/test";

/**
 * Dolu sidebar'dan bir sekme seçer — direkt öğeler (Bugün/Haber Havuzu/
 * Günlük Kuyruk) ve grup altı sayfalar aynı `sidebar-tab-{id}` testid'ini taşır.
 */
export async function selectTab(page: Page, tabId: string): Promise<void> {
  await page.getByTestId(`sidebar-tab-${tabId}`).click();
}

/**
 * Sistem kümesinden bir utility sayfası seçer (`sidebar-utility-{id}`).
 */
export async function selectUtility(
  page: Page,
  tabId: "toolbox" | "costs" | "system" | "settings",
): Promise<void> {
  await page.getByTestId(`sidebar-utility-${tabId}`).click();
}
