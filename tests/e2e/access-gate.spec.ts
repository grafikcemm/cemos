import { test, expect } from "@playwright/test";

/**
 * Erişim kapısı (ADR-049: "Sign in with Vercel" OIDC). Parola YOK. Bu spec
 * kimliksiz senaryoları test eder → global storageState'i temizler.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("kimliksiz istek / kök yolunu /giris'e yönlendirir (parola alanı YOK)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/giris/);
  await expect(page.getByRole("link", { name: /Vercel ile giriş yap/ })).toBeVisible();
  // Parola sistemi emekli: eski parola alanı artık yok.
  await expect(page.getByLabel("Parola")).toHaveCount(0);
});

test("kimliksiz API isteği 401 döner", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(401);
});

test("sign-in butonu Vercel authorize akışına yönlendirir", async ({ page }) => {
  await page.goto("/giris");
  const link = page.getByRole("link", { name: /Vercel ile giriş yap/ });
  await expect(link).toHaveAttribute("href", /\/api\/auth\/authorize/);
});
