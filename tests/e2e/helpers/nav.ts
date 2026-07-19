import type { Page } from "@playwright/test";
import {
  normalizeTabId,
  resolveAreaForTab,
  isAdvancedTab,
  isUtilityTab,
  isProfileTab,
  subTabsOfArea,
  labelForTab,
} from "../../../src/components/nav/navConfig";

/**
 * Herhangi bir ekrana, sınıfına uygun GERÇEK nav yoluyla gider (rebuild IA):
 *  - birincil alan üyesi → sidebar alan + (çok-sekmeliyse) workspace subnav
 *  - REDESIGNED-ADVANCED → Cmd+K (sidebar'da yok)
 *  - Toolbox (utility) → sidebar Toolbox
 *  - Profil yüzeyi → sidebar Profil menüsü
 * ABSORBED id (daily-queue, viral-library…) normalize edilip yeni evine iner.
 */
export async function selectTab(page: Page, tabId: string): Promise<void> {
  const id = normalizeTabId(tabId);

  // Hydration-race guard (Phase 5A / ADR-044): the SSR paint renders the sidebar
  // as visible/clickable before React attaches listeners, so a click can land
  // pre-hydration and be swallowed (activeTab never changes). Wait for AppShell's
  // committed-effect signal — a real user-interactive milestone, not a timeout —
  // before any navigation click. Covers every path below (area/subnav, toolbox,
  // profile, Cmd+K: child effects commit before the shell-ready parent effect).
  await page.locator('[data-shell-ready="true"]').waitFor({ state: "attached" });

  const area = resolveAreaForTab(id);
  if (area) {
    await page.getByTestId(`sidebar-area-${area}`).click();
    if (subTabsOfArea(area).length > 1) {
      await page.getByTestId(`subnav-tab-${id}`).click();
    }
    return;
  }

  if (isUtilityTab(id)) {
    await page.getByTestId("sidebar-toolbox").click();
    return;
  }

  if (isProfileTab(id)) {
    await page.getByTestId("sidebar-profile").click();
    await page.getByTestId(`profile-item-${id}`).click();
    return;
  }

  if (isAdvancedTab(id)) {
    // Advanced ekranlar sidebar'da yok → Cmd+K. Klavye dinleyicisi hydration'da
    // bağlanır; üstteki shell-ready guard onun bağlı olduğunu garanti eder
    // (CommandPalette child effect'i shell-ready parent effect'inden ÖNCE commit
    // olur) → ayrı bir visible-guard'a gerek yok.
    await page.keyboard.press("Control+k");
    await page.getByLabel("Ekran ara").fill(labelForTab(id));
    await page.keyboard.press("Enter");
    return;
  }

  throw new Error(`selectTab: bilinmeyen ekran id'si "${tabId}"`);
}

/**
 * Geriye dönük uyum sarmalayıcı. Rebuild IA'da Toolbox utility; costs/system/
 * settings Profil yüzeyleridir — selectTab hepsini doğru yoldan açar.
 */
export async function selectUtility(
  page: Page,
  tabId: "toolbox" | "costs" | "system" | "settings",
): Promise<void> {
  await selectTab(page, tabId);
}
