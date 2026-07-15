import { request, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * E2E global setup (Faz 1A erişim kapısı). Gerçek kapı E2E'de aktif
 * (webServer.env ACCESS_PASSWORD_HASH). Bir kez login olup storageState yazar;
 * tüm spec'ler `use.storageState` ile kimlikli koşar. access-gate.spec kimliksiz
 * senaryolar için storageState'i temizler.
 */
export const STORAGE_STATE = "tests/e2e/.auth/state.json";
export const E2E_PASSWORD = "e2e-test-pass";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3211";
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });

  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post("/api/auth/login", { data: { password: E2E_PASSWORD } });
  if (!res.ok()) {
    throw new Error(`E2E login başarısız: ${res.status()} — webServer.env ACCESS_PASSWORD_HASH?`);
  }
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
}
