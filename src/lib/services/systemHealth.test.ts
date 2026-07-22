import { describe, it, expect } from "vitest";
import {
  deriveSystemHealth,
  deriveProblems,
  healthDotColor,
  type HealthPayload,
} from "./systemHealth";

const okHealth: HealthPayload = {
  openrouter: { configured: true, ok: true },
  socialdata: { configured: true, ok: true },
  buffer: { configured: false, ok: false },
  database: { ok: true },
  worker: { mode: "worker", inferredStatus: "recent_tick" },
};

describe("deriveSystemHealth — TEK türetim (§8C)", () => {
  it("henüz veri yok → checking (final DEĞİL, healthy DEĞİL)", () => {
    const r = deriveSystemHealth({ loaded: false, fetchError: false, health: null });
    expect(r.state).toBe("checking");
    expect(r.label).toBe("kontrol ediliyor");
    expect(r.problems).toHaveLength(0);
  });

  it("fetch başarısız → unavailable; kesin sorun SAYISI verilmez", () => {
    const r = deriveSystemHealth({ loaded: false, fetchError: true, health: null });
    expect(r.state).toBe("unavailable");
    expect(r.label).toBe("durum alınamadı");
    expect(r.problems).toHaveLength(0);
  });

  it("ELDE veri VARKEN fetch düşerse → yine unavailable (bayat sayıya güvenme)", () => {
    // Worker offline eski veri olsa bile: son fetch başarısız → unavailable.
    const r = deriveSystemHealth({ loaded: true, fetchError: true, health: okHealth });
    expect(r.state).toBe("unavailable");
    expect(r.problems).toHaveLength(0);
  });

  it("her şey OK → healthy", () => {
    const r = deriveSystemHealth({ loaded: true, fetchError: false, health: okHealth });
    expect(r.state).toBe("healthy");
    expect(r.label).toBe("sağlıklı");
    expect(r.hasError).toBe(false);
  });

  it("worker durmuş (worker modu) → ASLA healthy; warning + hasError", () => {
    const r = deriveSystemHealth({
      loaded: true,
      fetchError: false,
      health: { ...okHealth, worker: { mode: "worker", inferredStatus: "stale", recommendation: "npm run worker" } },
    });
    expect(r.state).toBe("warning");
    expect(r.state).not.toBe("healthy");
    expect(r.hasError).toBe(true);
    expect(r.problems[0].label).toBe("Worker çalışmıyor");
  });

  it("cron gecikmiş → warning ama warn-severity (error DEĞİL)", () => {
    const r = deriveSystemHealth({
      loaded: true,
      fetchError: false,
      health: { ...okHealth, worker: { mode: "cron", inferredStatus: "stale" } },
    });
    expect(r.state).toBe("warning");
    expect(r.hasError).toBe(false);
    expect(r.problems[0].label).toBe("Cron gecikmiş");
    expect(r.problems[0].severity).toBe("warn");
  });

  it("provider (openrouter) hatalı → warning + hasError", () => {
    const r = deriveSystemHealth({
      loaded: true,
      fetchError: false,
      health: { ...okHealth, openrouter: { configured: true, ok: false, message: "401" } },
    });
    expect(r.state).toBe("warning");
    expect(r.hasError).toBe(true);
    expect(r.problems.map((p) => p.label)).toContain("OpenRouter hatalı");
  });

  it("veritabanı hatalı → warning + hasError", () => {
    const r = deriveSystemHealth({
      loaded: true,
      fetchError: false,
      health: { ...okHealth, database: { ok: false, message: "P1001" } },
    });
    expect(r.state).toBe("warning");
    expect(r.problems.map((p) => p.label)).toContain("Veritabanı hatalı");
  });

  it("tek sorunda etiket sorunun adı; çoklu sorunda 'N sorun'", () => {
    const one = deriveSystemHealth({
      loaded: true,
      fetchError: false,
      health: { ...okHealth, worker: { mode: "worker", inferredStatus: "stale" } },
    });
    expect(one.label).toBe("Worker çalışmıyor");
    const many = deriveSystemHealth({
      loaded: true,
      fetchError: false,
      health: {
        ...okHealth,
        worker: { mode: "worker", inferredStatus: "stale" },
        database: { ok: false },
      },
    });
    expect(many.label).toBe("2 sorun");
  });
});

describe("deriveProblems — yalnız yapılandırılmış + başarısız provider", () => {
  it("configured olmayan buffer ok:false olsa da sorun DEĞİL", () => {
    expect(deriveProblems({ buffer: { configured: false, ok: false } })).toHaveLength(0);
  });
  it("null health → boş", () => {
    expect(deriveProblems(null)).toHaveLength(0);
  });
});

describe("healthDotColor — durum → semantik renk", () => {
  it("healthy=ok, warning(error)=error, warning(warn)=warn, checking/unavailable=muted", () => {
    expect(healthDotColor({ state: "healthy", problems: [], label: "", hasError: false })).toContain("status-ok");
    expect(healthDotColor({ state: "warning", problems: [], label: "", hasError: true })).toContain("status-error");
    expect(healthDotColor({ state: "warning", problems: [], label: "", hasError: false })).toContain("status-warn");
    expect(healthDotColor({ state: "checking", problems: [], label: "", hasError: false })).toContain("text-muted");
    expect(healthDotColor({ state: "unavailable", problems: [], label: "", hasError: false })).toContain("text-muted");
  });
});
