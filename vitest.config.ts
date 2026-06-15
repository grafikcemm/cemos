import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
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
