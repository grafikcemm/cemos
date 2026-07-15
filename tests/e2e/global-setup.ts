import { request, type APIRequestContext, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * E2E global setup (Faz 1A erişim kapısı). Gerçek kapı E2E'de aktif
 * (webServer.env ACCESS_PASSWORD_HASH). Bir kez login olup storageState yazar;
 * tüm spec'ler `use.storageState` ile kimlikli koşar. access-gate.spec kimliksiz
 * senaryolar için storageState'i temizler.
 *
 * Soğuk Next dev sunucusunda İLK istek route + proxy + modül grafiğini derler ve
 * 30s varsayılan timeout'u aşabilir → warmup GET + uzun timeout'lu retry.
 */
export const STORAGE_STATE = "tests/e2e/.auth/state.json";
export const E2E_PASSWORD = "e2e-test-pass";

const COLD_COMPILE_TIMEOUT = 120_000;
const LOGIN_ATTEMPTS = 5;

async function warmup(ctx: APIRequestContext): Promise<void> {
  // /giris allow-list'te; sayfa + proxy derlemesini login POST'tan önce tetikler.
  for (let i = 0; i < LOGIN_ATTEMPTS; i++) {
    try {
      const res = await ctx.get("/giris", { timeout: COLD_COMPILE_TIMEOUT });
      if (res.ok()) return;
    } catch {
      /* ilk derleme sürüyor — tekrar dene */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function loginWithRetry(ctx: APIRequestContext) {
  let lastErr: unknown;
  for (let i = 0; i < LOGIN_ATTEMPTS; i++) {
    try {
      const res = await ctx.post("/api/auth/login", {
        data: { password: E2E_PASSWORD },
        timeout: COLD_COMPILE_TIMEOUT,
      });
      if (res.ok()) return;
      lastErr = new Error(`E2E login başarısız: ${res.status()} — webServer.env ACCESS_PASSWORD_HASH?`);
    } catch (e) {
      lastErr = e; // soğuk derleme timeout'u — retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3211";
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });

  const ctx = await request.newContext({ baseURL });
  await warmup(ctx);
  await loginWithRetry(ctx);
  // Kimlikli "/" warmup: proxy oturum cookie'siyle geçer → anasayfa derlenir.
  // (Login formu 303 ile "/"ye döner; ilk tarayıcı isteği soğuk derlemeye
  // takılmasın diye önceden derlenir.)
  await ctx.get("/", { timeout: COLD_COMPILE_TIMEOUT }).catch(() => {});
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
}
