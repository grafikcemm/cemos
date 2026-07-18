import { describe, it, expect } from "vitest";
import { parseInspirationMeta, serializeInspirationMeta, InspirationMetaSchema } from "./inspirationMeta";

const VALID = {
  schemaVersion: "1",
  kind: "inspiration_capture",
  format: "ig_reel",
  formatSource: "operator",
  creatorHandle: "rakip",
  caption: "caption",
  transcript: "",
  manualMetrics: {
    provenance: "operator_observed",
    observedAt: "2026-07-18T00:00:00.000Z",
    likes: 100,
  },
  capturedAt: "2026-07-18T00:00:00.000Z",
  analysis: null,
};

describe("inspirationMeta zarfı", () => {
  it("geçerli zarf roundtrip eder", () => {
    const parsed = parseInspirationMeta(serializeInspirationMeta(InspirationMetaSchema.parse(VALID)));
    expect(parsed?.manualMetrics?.provenance).toBe("operator_observed");
  });

  it("bozuk JSON fail-closed null (throw yok)", () => {
    expect(parseInspirationMeta("{bozuk")).toBeNull();
    expect(parseInspirationMeta("")).toBeNull();
    expect(parseInspirationMeta(null)).toBeNull();
  });

  it("yabancı/versiyonsuz zarf fail-closed null — rawMetadata çöplüğüne dönüşmez", () => {
    expect(parseInspirationMeta(JSON.stringify({ foo: "bar" }))).toBeNull();
    expect(parseInspirationMeta(JSON.stringify({ ...VALID, schemaVersion: "999" }))).toBeNull();
  });

  it("manuel metrik provenance'sız KABUL EDİLMEZ (Meta metriği gibi gösterilemez)", () => {
    const noProvenance = {
      ...VALID,
      manualMetrics: { observedAt: "2026-07-18T00:00:00.000Z", likes: 5 },
    };
    expect(InspirationMetaSchema.safeParse(noProvenance).success).toBe(false);
  });
});
