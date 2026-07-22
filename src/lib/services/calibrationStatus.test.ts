import { describe, it, expect, vi, beforeEach } from "vitest";

const psGroupBy = vi.fn();
const igCount = vi.fn();
const vpCount = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: {
    performanceSnapshot: { groupBy: (...a: unknown[]) => psGroupBy(...a) },
    igInsightSnapshot: { count: (...a: unknown[]) => igCount(...a) },
    viralPattern: { count: (...a: unknown[]) => vpCount(...a) },
  },
}));
const latestRunByKind = vi.fn();
vi.mock("@/lib/db/evalRunRepo", () => ({ evalRunRepo: { latestRunByKind: (...a: unknown[]) => latestRunByKind(...a) } }));

import { buildCalibrationStatus } from "./calibrationStatus";

beforeEach(() => {
  vi.clearAllMocks();
  psGroupBy.mockResolvedValue([]);
  igCount.mockResolvedValue(0);
  vpCount.mockResolvedValue(0);
  latestRunByKind.mockResolvedValue(null);
});

describe("buildCalibrationStatus (ADR-046 — dürüst kalibrasyon durumu)", () => {
  it("boş DB: outcomeCalibrated=false + dürüst 'KALİBRE DEĞİL' (sahte skor yok)", async () => {
    const s = await buildCalibrationStatus();
    expect(s.outcomeCalibrated).toBe(false);
    expect(s.reason).toContain("KALİBRE DEĞİL");
    expect(s.normalization.active).toBe(false); // normalizedScore ham
    expect(s.thresholds.provisional).toBe(true);
    const matched = s.samples.find((x) => x.key === "matched_outcomes")!;
    expect(matched.observed).toBe(0);
    expect(matched.sufficient).toBe(false);
    expect(matched.floor).toBe(5);
    expect(s.blockers.length).toBeGreaterThan(0);
  });

  it("yeterli eşleşen sonuç (≥5) → outcomeCalibrated=true", async () => {
    psGroupBy.mockResolvedValue([
      { publishedPostId: "p1" }, { publishedPostId: "p2" }, { publishedPostId: "p3" },
      { publishedPostId: "p4" }, { publishedPostId: "p5" },
    ]);
    const s = await buildCalibrationStatus();
    expect(s.outcomeCalibrated).toBe(true);
    expect(s.reason).toContain("kullanılabilir");
  });

  it("eval geçmişi özetlenir (present/status/policyVersion)", async () => {
    latestRunByKind.mockImplementation((kind: string) =>
      kind === "registry_contract"
        ? Promise.resolve({ status: "passed", mode: "deterministic", policyVersion: "2E-1", passedCount: 16, failedCount: 0, createdAt: new Date("2026-07-19") })
        : Promise.resolve(null),
    );
    const s = await buildCalibrationStatus();
    expect(s.eval.registryContract.present).toBe(true);
    expect(s.eval.registryContract.status).toBe("passed");
    expect(s.eval.registryContract.policyVersion).toBe("2E-1");
    expect(s.eval.golden.present).toBe(false);
  });

  it("validated + candidate pattern sayımları ayrı raporlanır", async () => {
    vpCount.mockImplementation((args: { where?: { validatedAt?: unknown } }) =>
      args?.where?.validatedAt === null ? Promise.resolve(4) : Promise.resolve(2),
    );
    const s = await buildCalibrationStatus();
    const vp = s.samples.find((x) => x.key === "validated_patterns")!;
    expect(vp.observed).toBe(2); // validated
    expect(vp.note).toContain("Aday (doğrulanmamış): 4");
  });

  it("bölüm hatası fail-soft: PerformanceSnapshot düşse diğerleri yaşar", async () => {
    psGroupBy.mockRejectedValue(new Error("db down"));
    const s = await buildCalibrationStatus();
    expect(s.sectionErrors.some((e) => e.startsWith("matched_outcomes:"))).toBe(true);
    expect(s.outcomeCalibrated).toBe(false);
    expect(s.samples.some((x) => x.key === "validated_patterns")).toBe(true);
  });
});
