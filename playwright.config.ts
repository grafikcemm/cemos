import { defineConfig } from "@playwright/test";
import { STORAGE_STATE } from "./tests/e2e/global-setup";

// E2E smoke suite. Data-independent: tests assert UI shells/placeholders, never
// row counts, so they pass on an empty database too. Port 3211 avoids clashing
// with a running dev server.
//
// Faz 1A: erişim kapısı E2E'de GERÇEK olarak aktif (webServer.env
// ACCESS_PASSWORD_HASH + SESSION_SECRET). globalSetup bir kez login olur →
// storageState; tüm spec'ler kimlikli koşar. access-gate.spec kimliksiz test
// eder. reuseExistingServer:false → kapı deterministik (3211 boş olmalı).
const PORT = 3211;

// Sabit E2E parolası "e2e-test-pass" için scrypt hash (sabit salt).
const E2E_PASSWORD_HASH =
  "scrypt$00112233445566778899aabbccddeeff$afa305da0d5974456f5dbb2648ccd363005f6ab5c59dce3323fe6896e5d8d240";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  retries: 0,
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
    env: {
      ...process.env,
      ACCESS_PASSWORD_HASH: E2E_PASSWORD_HASH,
      SESSION_SECRET: "e2e-session-secret-not-a-real-key",
    },
  },
});
