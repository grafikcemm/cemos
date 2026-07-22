import { defineConfig } from "@playwright/test";
import { STORAGE_STATE } from "./tests/e2e/global-setup";
import { buildE2eServerEnv } from "./tests/e2e/e2eEnv";

// E2E smoke suite. Data-independent: tests assert UI shells/placeholders, never
// row counts, so they pass on an empty database too. Port 3211 avoids clashing
// with a running dev server.
//
// ADR-049: erişim kapısı OIDC'ye taşındı. E2E'de gerçek OAuth round-trip yapılamaz;
// globalSetup sunucuyla AYNI SESSION_SECRET ile geçerli bir cemos_session imzalar →
// tüm spec'ler kimlikli koşar. access-gate.spec kimliksiz test eder.
// reuseExistingServer:false → kapı deterministik (3211 boş olmalı).
const PORT = 3211;

export default defineConfig({
  testDir: "tests/e2e",
  // YALNIZ .spec.ts (playwright). tests/e2e/e2eEnv.test.ts vitest guard'ıdır —
  // Playwright'ın varsayılan testMatch'i .test.ts'i de alır ve "vitest require"
  // hatası verirdi; bu match onu dışarıda bırakır (unit suite'te koşar).
  testMatch: "**/*.spec.ts",
  timeout: 45_000,
  // Soğuk `next dev` sunucusunda deterministiklik: tek worker route derlemesini
  // serileştirir; retries:1 nadir ilk-derleme flake'ini yutar.
  workers: 1,
  retries: 1,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: STORAGE_STATE,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    // NEON EGRESS CLOSURE: `...process.env` KALDIRILDI — production DATABASE_URL +
    // sağlayıcı secret'larını E2E dev server'a sızdırıyordu. buildE2eServerEnv:
    // DATABASE_URL'i dummy ephemeral'e zorlar + secret'ları boş-gölgeler + aynı
    // SESSION_SECRET'i verir → E2E Neon'a bağlanamaz, canlı sağlayıcıya çağrı yapamaz.
    env: buildE2eServerEnv(),
  },
});
