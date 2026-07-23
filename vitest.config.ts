import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // WP-02f: yapısal dummy DATABASE_URL + uzak-host fail-closed reddi — unit
    // suite hiçbir koşulda Neon/Supabase/uzak Postgres'e bağlanamaz.
    setupFiles: ["./vitest.setup.ts"],
    // tests/e2e/**/*.test.ts: E2E harness guard'ları (e2eEnv) unit suite'te koşar;
    // playwright .spec.ts dosyaları (.test.ts DEĞİL) bilinçle dışarıda kalır.
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "tests/e2e/**/*.test.ts"],
    // JUnit artifact enables run-over-run trend/flakiness analysis (TRAN-ITEM-1.11).
    reporters: ["default", ["junit", { outputFile: "reports/vitest-junit.xml" }]],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
