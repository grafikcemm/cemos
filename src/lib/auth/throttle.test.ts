import { describe, it, expect } from "vitest";
import { ipKeyFor, clientIpFrom } from "./throttle";

describe("throttle ip keying (ham IP saklanmaz)", () => {
  it("ipKey deterministik ama ham IP'yi içermez", () => {
    const ip = "203.0.113.7";
    const key = ipKeyFor(ip, "secret");
    expect(key).toBe(ipKeyFor(ip, "secret")); // deterministik
    expect(key).not.toContain(ip); // HMAC — ham IP sızmaz
    expect(key).toMatch(/^[0-9a-f]{32}$/); // hex, sabit uzunluk
  });

  it("farklı sır → farklı anahtar", () => {
    expect(ipKeyFor("203.0.113.7", "a")).not.toBe(ipKeyFor("203.0.113.7", "b"));
  });

  it("farklı IP → farklı anahtar", () => {
    expect(ipKeyFor("1.1.1.1", "s")).not.toBe(ipKeyFor("2.2.2.2", "s"));
  });
});

describe("clientIpFrom (güvenilir forwarding zinciri)", () => {
  it("x-forwarded-for ilk hop'u alır", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(clientIpFrom(h)).toBe("203.0.113.7");
  });

  it("xff yoksa x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.4" });
    expect(clientIpFrom(h)).toBe("198.51.100.4");
  });

  it("hiçbiri yoksa 'unknown'", () => {
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
