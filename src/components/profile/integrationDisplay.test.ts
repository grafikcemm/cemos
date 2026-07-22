import { describe, it, expect } from "vitest";
import { display, type Provider, type Health, type Liveness } from "./integrationDisplay";

const base: Provider = {
  key: "openrouter",
  name: "OpenRouter",
  group: "core",
  status: "connected",
  envNames: ["OPENROUTER_API_KEY"],
};

const L = (state: Liveness["state"]): Liveness => ({
  state,
  lastSuccessAt: state === "verified" ? new Date(0).toISOString() : null,
  lastFailureAt: state === "degraded" ? new Date(0).toISOString() : null,
  lastErrorClass: state === "degraded" ? "provider_credit" : null,
});

// Shallow /api/health: openrouter/socialdata "ok" is only env presence (no real
// call); metaToken "ok" is token-expiry metadata; database "ok" is a real probe.
const shallowHealth: Health = {
  openrouter: { configured: true, ok: true, message: "API anahtarı mevcut" },
  socialdata: { configured: true, ok: true, message: "API anahtarı mevcut" },
  database: { ok: true, message: "DB OK" },
  metaToken: { ok: true, message: "token geçerli" },
};

describe("integration display honesty (closure F)", () => {
  it("configured-but-broken (last real call failed / 402) is NEVER green", () => {
    const d = display({ ...base, liveness: L("degraded") }, shallowHealth);
    expect(d.variant).toBe("yellow");
    expect(d.label).toContain("başarısız");
  });

  it("never-called provider is 'configured · not verified' even with env present", () => {
    const d = display({ ...base, liveness: L("unknown") }, shallowHealth);
    expect(d.variant).toBe("muted");
    expect(d.label).toContain("doğrulanmadı");
  });

  it("verified (recent real success) shows green 'bağlı'", () => {
    const d = display({ ...base, liveness: L("verified") }, shallowHealth);
    expect(d.variant).toBe("success");
    expect(d.label).toBe("bağlı");
  });

  it("database uses its REAL probe → green even with unknown liveness", () => {
    const neon: Provider = {
      key: "neon",
      name: "Neon",
      group: "core",
      status: "connected",
      envNames: ["DATABASE_URL"],
      liveness: L("unknown"),
    };
    expect(display(neon, shallowHealth).variant).toBe("success");
  });

  it("meta valid-but-unverified token (expiry-only) is not a live connection", () => {
    const meta: Provider = {
      key: "meta",
      name: "Meta",
      group: "social",
      status: "connected",
      envNames: ["META_ACCESS_TOKEN"],
      liveness: L("unknown"),
    };
    const d = display(meta, shallowHealth);
    expect(d.variant).toBe("muted");
    expect(d.label).toContain("doğrulanmadı");
  });

  it("a real FAILING probe shows 'yanıt yok'", () => {
    const failing: Health = { ...shallowHealth, openrouter: { ok: false, message: "hata" } };
    const d = display({ ...base, liveness: L("unknown") }, failing);
    expect(d.variant).toBe("yellow");
    expect(d.label).toBe("yanıt yok");
  });

  it("missing / blocked / optional statuses render honestly", () => {
    expect(display({ ...base, status: "missing" }, null).label).toBe("eksik");
    expect(display({ ...base, status: "blocked" }, null).label).toBe("engelli");
    expect(display({ ...base, status: "optional" }, null).label).toBe("opsiyonel");
  });
});
