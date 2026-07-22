import { describe, it, expect } from "vitest";
import {
  deriveHealthProblems,
  healthProblemsLevel,
  type SystemHealthContracts,
  type InfraItem,
  type PipelineItem,
} from "./healthContracts";

function makeContracts(infraItems: InfraItem[], pipelineItems: PipelineItem[]): SystemHealthContracts {
  return {
    infrastructure: { status: "ok", items: infraItems },
    pipelineFreshness: { status: "ok", items: pipelineItems, news: null },
    todayReadiness: { status: "ok", phase: "queue_completed", counts: null, message: "" },
    topbar: { level: "none", label: "sağlıklı" },
    operatorAction: { level: "ok", canGenerate: true, todayNeedsGeneration: false, blockers: [], warnings: [] },
    instagramPlanning: null,
  };
}

describe("deriveHealthProblems (canonical infra + pipeline)", () => {
  it("includes cronAuth error that the legacy narrow derivation missed", () => {
    const c = makeContracts(
      [
        { key: "database", label: "Veritabanı", status: "ok" },
        { key: "cron_auth", label: "Cron yetkilendirme", status: "error", detail: "CRON_SECRET yok" },
      ],
      [],
    );
    const problems = deriveHealthProblems(c);
    expect(problems.map((p) => p.label)).toContain("Cron yetkilendirme");
    expect(problems.find((p) => p.key === "cron_auth")?.severity).toBe("error");
  });

  it("excludes optional-unconfigured integrations (never reddens the system)", () => {
    const c = makeContracts(
      [{ key: "meta", label: "Instagram (Meta)", status: "ok", optionalUnconfigured: true }],
      [],
    );
    expect(deriveHealthProblems(c)).toEqual([]);
  });

  it("includes a credential warn (e.g. Meta token expiring)", () => {
    const c = makeContracts([{ key: "cred_Meta token", label: "Meta token", status: "warn", detail: "3 gün" }], []);
    const problems = deriveHealthProblems(c);
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("warn");
  });

  it("includes a failing/delayed pipeline flow as warn, excludes fresh", () => {
    const c = makeContracts(
      [],
      [
        { key: "news", label: "Haber", state: "failing", lastRunAt: null, detail: "0 analiz" },
        { key: "youtube", label: "YouTube", state: "fresh", lastRunAt: "x" },
        { key: "mining", label: "Mining", state: "delayed", lastRunAt: "y" },
      ],
    );
    const problems = deriveHealthProblems(c);
    expect(problems.map((p) => p.key)).toEqual(["pipeline_news", "pipeline_mining"]);
    expect(problems.every((p) => p.severity === "warn")).toBe(true);
  });

  it("returns empty when everything is healthy", () => {
    const c = makeContracts([{ key: "database", label: "Veritabanı", status: "ok" }], [
      { key: "news", label: "Haber", state: "fresh", lastRunAt: "x" },
    ]);
    expect(deriveHealthProblems(c)).toEqual([]);
  });

  // Regresyon (phase3e-plan e2e): /api/health `contracts`'ı DOĞRULANMADAN gelir ve
  // KISMİ olabilir. Bir bölüm eksikken derive ASLA throw etmemeli — aksi hâlde global
  // TopStrip/Bugün-tiki tüm shell'i düşürür ("Cannot read properties of undefined
  // (reading 'items')"). Bu birim testleri o crash'i sözleşme kısmiyken kilitler.
  it("KISMİ sözleşme: yalnız instagramPlanning taşıyan yük throw ETMEZ → []", () => {
    const partial = { instagramPlanning: { version: "instagram_plan_health.v1" } } as unknown as SystemHealthContracts;
    expect(() => deriveHealthProblems(partial)).not.toThrow();
    expect(deriveHealthProblems(partial)).toEqual([]);
  });

  it("KISMİ sözleşme: boş nesne throw ETMEZ → []", () => {
    expect(deriveHealthProblems({} as unknown as SystemHealthContracts)).toEqual([]);
  });

  it("KISMİ sözleşme: infrastructure var ama pipelineFreshness yok → yalnız infra sorunları", () => {
    const partial = {
      infrastructure: { status: "error", items: [{ key: "cron_auth", label: "Cron yetkilendirme", status: "error" }] },
    } as unknown as SystemHealthContracts;
    const problems = deriveHealthProblems(partial);
    expect(problems.map((p) => p.key)).toEqual(["cron_auth"]);
  });
});

describe("healthProblemsLevel", () => {
  it("ok when empty", () => {
    expect(healthProblemsLevel([])).toBe("ok");
  });
  it("warn when only warnings", () => {
    expect(healthProblemsLevel([{ key: "a", label: "a", severity: "warn" }])).toBe("warn");
  });
  it("error when any error present", () => {
    expect(
      healthProblemsLevel([
        { key: "a", label: "a", severity: "warn" },
        { key: "b", label: "b", severity: "error" },
      ]),
    ).toBe("error");
  });
});
