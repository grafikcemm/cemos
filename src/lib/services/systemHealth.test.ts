import { describe, it, expect } from "vitest";
import {
  deriveSystemHealth,
  deriveProblems,
  deriveDbAvailability,
  formatLastGoodAt,
  healthDotColor,
  type HealthPayload,
} from "./systemHealth";

describe("deriveDbAvailability — WP-01 tek DB-down sinyali", () => {
  it("database.ok === false → dbUnavailable:true + breaker retry ipucu", () => {
    const r = deriveDbAvailability({
      database: { ok: false, message: "Veritabanına şu anda erişilemiyor." },
      dbCircuit: { open: true, retryAfterSeconds: 27 },
    });
    expect(r).toEqual({ dbUnavailable: true, retryAfterSeconds: 27 });
  });

  it("database.ok true veya payload yok → dbUnavailable:false (yanlış alarm yok)", () => {
    expect(deriveDbAvailability({ database: { ok: true } })).toEqual({
      dbUnavailable: false,
      retryAfterSeconds: null,
    });
    expect(deriveDbAvailability(null)).toEqual({ dbUnavailable: false, retryAfterSeconds: null });
    // database alanı hiç yoksa (eski payload) → bilinmiyor ≠ kapalı.
    expect(deriveDbAvailability({} as HealthPayload).dbUnavailable).toBe(false);
  });

  it("breaker kapalıyken retryAfterSeconds null kalır", () => {
    const r = deriveDbAvailability({
      database: { ok: false },
      dbCircuit: { open: false, retryAfterSeconds: null },
    });
    expect(r.retryAfterSeconds).toBeNull();
  });
});

describe("formatLastGoodAt", () => {
  it("ISO damgayı İstanbul saatiyle HH:MM'e çevirir", () => {
    // 12:34 UTC = 15:34 Europe/Istanbul (sabit UTC+3).
    expect(formatLastGoodAt("2026-07-23T12:34:00.000Z")).toBe("15:34");
  });

  it("null/bozuk girişte null döner", () => {
    expect(formatLastGoodAt(null)).toBeNull();
    expect(formatLastGoodAt("not-a-date")).toBeNull();
  });
});

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
