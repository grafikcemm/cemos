import { defineConfig } from "@playwright/test";

// E2E smoke suite (TODO_test-analyzerxagent TRAN-CODE-1.5). Data-independent:
// tests assert UI shells/placeholders, never row counts, so they pass on an
// empty database too. Port 3211 avoids clashing with a running dev server.
const PORT = 3211;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
