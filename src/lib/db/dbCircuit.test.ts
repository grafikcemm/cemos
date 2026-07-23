import { describe, it, expect, beforeEach } from "vitest";
import {
  isDbCircuitOpen,
  recordDbFailure,
  recordDbSuccess,
  getDbCircuitState,
  __resetDbCircuitForTests,
} from "./dbCircuit";

const T0 = 1_000_000;

describe("dbCircuit", () => {
  beforeEach(() => {
    __resetDbCircuitForTests();
  });

  it("stays closed below the failure threshold", () => {
    recordDbFailure(T0);
    recordDbFailure(T0 + 1);
    expect(isDbCircuitOpen(T0 + 2)).toBe(false);
  });

  it("opens after 3 consecutive failures for 30s", () => {
    recordDbFailure(T0);
    recordDbFailure(T0 + 1);
    recordDbFailure(T0 + 2);
    expect(isDbCircuitOpen(T0 + 3)).toBe(true);
    expect(isDbCircuitOpen(T0 + 2 + 30_000)).toBe(false); // pencere doldu → half-open
  });

  it("failures while open do NOT extend the window (half-open must arrive)", () => {
    recordDbFailure(T0);
    recordDbFailure(T0);
    recordDbFailure(T0); // açıldı: T0+30s'e kadar
    recordDbFailure(T0 + 10_000); // açıkken gelen hata
    recordDbFailure(T0 + 20_000);
    expect(isDbCircuitOpen(T0 + 30_000)).toBe(false); // pencere UZAMADI
  });

  it("re-opens with exponential backoff after a failed half-open probe (30s → 60s, cap 5min)", () => {
    recordDbFailure(T0);
    recordDbFailure(T0);
    recordDbFailure(T0); // open #1: 30s
    const halfOpenAt = T0 + 30_000;
    expect(isDbCircuitOpen(halfOpenAt)).toBe(false);
    recordDbFailure(halfOpenAt); // half-open denemesi başarısız → open #2: 60s
    expect(isDbCircuitOpen(halfOpenAt + 59_000)).toBe(true);
    expect(isDbCircuitOpen(halfOpenAt + 60_000)).toBe(false);
  });

  it("caps the open window at 5 minutes", () => {
    // 6 açılış: 30s,60s,120s,240s,300s(cap),300s(cap)
    let now = T0;
    for (let round = 0; round < 6; round++) {
      recordDbFailure(now);
      recordDbFailure(now);
      recordDbFailure(now);
      const state = getDbCircuitState(now);
      expect(state.open).toBe(true);
      expect(state.retryAfterSeconds).toBeLessThanOrEqual(300);
      now += (state.retryAfterSeconds ?? 0) * 1000; // half-open anına atla
    }
    const finalState = getDbCircuitState(now - 1000);
    expect(finalState.retryAfterSeconds).toBeLessThanOrEqual(300);
  });

  it("success fully resets state (window AND backoff streak)", () => {
    recordDbFailure(T0);
    recordDbFailure(T0);
    recordDbFailure(T0); // open 30s
    recordDbSuccess();
    expect(isDbCircuitOpen(T0 + 1)).toBe(false);
    // Reset sonrası yeni açılış yine 30s taban penceresinden başlar.
    recordDbFailure(T0 + 10);
    recordDbFailure(T0 + 11);
    recordDbFailure(T0 + 12);
    expect(isDbCircuitOpen(T0 + 12 + 29_000)).toBe(true);
    expect(isDbCircuitOpen(T0 + 12 + 30_000)).toBe(false);
  });

  it("getDbCircuitState reports retryAfterSeconds only while open", () => {
    expect(getDbCircuitState(T0)).toEqual({
      open: false,
      consecutiveFailures: 0,
      retryAfterSeconds: null,
    });
    recordDbFailure(T0);
    recordDbFailure(T0);
    recordDbFailure(T0);
    const state = getDbCircuitState(T0 + 1_000);
    expect(state.open).toBe(true);
    expect(state.consecutiveFailures).toBe(3);
    expect(state.retryAfterSeconds).toBe(29);
  });
});
