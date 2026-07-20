/**
 * REAL-Postgres integration test for OperatorSetting upsert durability.
 *
 * Proves the single-PK `INSERT ... ON CONFLICT (key) DO UPDATE` upsert never
 * duplicates the row under concurrent writes — the durable-profile guarantee the
 * mocked unit test (bare `upsert: vi.fn()`) cannot express.
 *
 * Gated: skipped unless DB_INTEGRATION=1; refuses a non-ephemeral DATABASE_URL.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { shouldRunDbIntegration, truncate, prisma } from "@/test/integration/guard";
import { setModelProfile, getModelProfile, __resetSettingsCache } from "./settingsService";

const RUN = shouldRunDbIntegration();

describe.skipIf(!RUN)("OperatorSetting upsert — real Postgres durability", () => {
  beforeEach(async () => {
    await truncate(["OperatorSetting"]);
    __resetSettingsCache();
  });

  it("set persists durably; a second set updates the SAME row (ON CONFLICT), not a 2nd", async () => {
    await setModelProfile("premium");
    __resetSettingsCache();
    expect(await getModelProfile()).toBe("premium");

    await setModelProfile("operator_quality");
    expect(await prisma.operatorSetting.count({ where: { key: "model_profile" } })).toBe(1);
    __resetSettingsCache();
    expect(await getModelProfile()).toBe("operator_quality");
  });

  it("concurrent sets converge to a single row (ON CONFLICT never duplicates the PK)", async () => {
    await Promise.all([
      setModelProfile("premium"),
      setModelProfile("operator_quality"),
      setModelProfile("dev"),
    ]);
    expect(await prisma.operatorSetting.count({ where: { key: "model_profile" } })).toBe(1);
  });
});
