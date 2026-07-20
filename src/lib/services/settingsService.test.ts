import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { findUnique, upsert } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: { operatorSetting: { findUnique, upsert } },
}));

import {
  getModelProfile,
  setModelProfile,
  isModelProfile,
  __resetSettingsCache,
} from "./settingsService";

const originalProfile = process.env.MODEL_PROFILE;

beforeEach(() => {
  vi.clearAllMocks();
  __resetSettingsCache();
  delete process.env.MODEL_PROFILE;
});

afterEach(() => {
  if (originalProfile === undefined) delete process.env.MODEL_PROFILE;
  else process.env.MODEL_PROFILE = originalProfile;
});

describe("settingsService.getModelProfile", () => {
  it("returns the durable value from OperatorSetting", async () => {
    findUnique.mockResolvedValueOnce({ key: "model_profile", value: "premium" });
    expect(await getModelProfile()).toBe("premium");
    // converges the sync resolver path
    expect(process.env.MODEL_PROFILE).toBe("premium");
  });

  it("falls back to env when no row exists", async () => {
    findUnique.mockResolvedValueOnce(null);
    process.env.MODEL_PROFILE = "dev";
    expect(await getModelProfile()).toBe("dev");
  });

  it("falls back to default when no row and no env", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await getModelProfile()).toBe("operator_quality");
  });

  it("ignores an invalid durable value and falls back", async () => {
    findUnique.mockResolvedValueOnce({ key: "model_profile", value: "garbage" });
    expect(await getModelProfile()).toBe("operator_quality");
  });

  it("fails open to env/default when the table is missing (DB throws), without caching the miss", async () => {
    findUnique.mockRejectedValueOnce(new Error("P2021: table does not exist"));
    process.env.MODEL_PROFILE = "premium";
    expect(await getModelProfile()).toBe("premium");
    // miss not cached → next call queries again
    findUnique.mockResolvedValueOnce({ key: "model_profile", value: "dev" });
    expect(await getModelProfile()).toBe("dev");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("caches within the TTL (no repeat query)", async () => {
    findUnique.mockResolvedValueOnce({ key: "model_profile", value: "premium" });
    const t0 = 1_000_000;
    expect(await getModelProfile(t0)).toBe("premium");
    expect(await getModelProfile(t0 + 10_000)).toBe("premium");
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("re-queries after the TTL expires", async () => {
    findUnique
      .mockResolvedValueOnce({ key: "model_profile", value: "premium" })
      .mockResolvedValueOnce({ key: "model_profile", value: "dev" });
    const t0 = 1_000_000;
    expect(await getModelProfile(t0)).toBe("premium");
    expect(await getModelProfile(t0 + 40_000)).toBe("dev");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("settingsService.setModelProfile", () => {
  it("upserts durably, returns the value, and converges env", async () => {
    upsert.mockResolvedValueOnce({ key: "model_profile", value: "operator_quality" });
    expect(await setModelProfile("operator_quality")).toBe("operator_quality");
    expect(upsert).toHaveBeenCalledWith({
      where: { key: "model_profile" },
      create: { key: "model_profile", value: "operator_quality" },
      update: { value: "operator_quality" },
    });
    expect(process.env.MODEL_PROFILE).toBe("operator_quality");
  });

  it("propagates a write failure (no serverless success lie)", async () => {
    upsert.mockRejectedValueOnce(new Error("connection refused"));
    await expect(setModelProfile("premium")).rejects.toThrow("connection refused");
  });

  it("rejects an invalid profile before touching the DB", async () => {
    await expect(setModelProfile("nope" as never)).rejects.toThrow(/Geçersiz/);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("isModelProfile", () => {
  it("accepts the three valid profiles and rejects others", () => {
    expect(isModelProfile("dev")).toBe(true);
    expect(isModelProfile("operator_quality")).toBe(true);
    expect(isModelProfile("premium")).toBe(true);
    expect(isModelProfile("free")).toBe(false);
    expect(isModelProfile(null)).toBe(false);
  });
});
