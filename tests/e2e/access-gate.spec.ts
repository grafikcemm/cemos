import { test, expect } from "@playwright/test";
import { E2E_PASSWORD } from "./global-setup";

/**
 * Faz 1A erişim kapısı (ADR-013/017). Bu spec kimliksiz senaryoları test eder →
 * global storageState'i temizler (diğer spec'ler kimlikli koşar).
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("kimliksiz istek / kök yolunu /giris'e yönlendirir", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/giris/);
  await expect(page.getByLabel("Parola")).toBeVisible();
});

test("yanlış parola /giris'te kalır ve hata gösterir", async ({ page }) => {
  await page.goto("/giris");
  await page.getByLabel("Parola").fill("kesinlikle-yanlis");
  await page.getByRole("button", { name: "Giriş" }).click();
  // native form → 500ms fail-delay + 303 redirect → /giris?e=invalid_password
  await expect(page).toHaveURL(/\/giris\?e=invalid_password/, { timeout: 15_000 });
  await expect(page.getByText("Parola hatalı")).toBeVisible();
});

test("doğru parola uygulamaya alır (Bugün)", async ({ page }) => {
  await page.goto("/giris");
  await page.getByLabel("Parola").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Giriş" }).click();
  // Native form → 303 → "/"; soğuk anasayfa derlemesine tolerans (5s yetmez).
  await expect(page).not.toHaveURL(/\/giris/, { timeout: 30_000 });
});
