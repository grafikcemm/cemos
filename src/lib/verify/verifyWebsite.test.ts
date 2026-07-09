import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { websiteVerification: { create: vi.fn(() => Promise.resolve({ id: "wv-1" })) } },
}));

import { prisma } from "@/lib/db/client";
import { assertSafeUrl, isPrivateIp, SsrfBlockedError } from "./ssrfGuard";
import { verifyWebsite, isDisallowedByRobots } from "./verifyWebsite";

// ── Test yardımcıları ────────────────────────────────────────────────────────

const publicResolver = async () => ["93.184.216.34"];

type Route = { status: number; headers?: Record<string, string>; body?: string };

/** URL → yanıt haritasından sahte fetch üretir (robots.txt dahil). */
function fakeFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const route = routes[url] ?? { status: 404 };
    return new Response(route.body ?? "", {
      status: route.status,
      headers: route.headers ?? {},
    });
  }) as typeof fetch;
}

beforeEach(() => vi.clearAllMocks());

// ── SSRF suite (SECURITY-SPEC §6 / §10 kabul maddesi) ───────────────────────

describe("SSRF suite — fetch ÖNCESİ red", () => {
  it("file:// şeması reddedilir", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(SsrfBlockedError);
  });

  it("gopher:// şeması reddedilir", async () => {
    await expect(assertSafeUrl("gopher://evil")).rejects.toThrow(SsrfBlockedError);
  });

  it("cloud metadata IP'si (169.254.169.254) reddedilir", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      SsrfBlockedError
    );
  });

  it("private IP literal'leri reddedilir (10/8, 172.16/12, 192.168/16, 127/8)", async () => {
    for (const ip of ["10.0.0.5", "172.16.1.1", "172.31.255.255", "192.168.1.1", "127.0.0.1"]) {
      await expect(assertSafeUrl(`http://${ip}/`)).rejects.toThrow(SsrfBlockedError);
    }
  });

  it("public görünümlü hostname private IP'ye çözülürse reddedilir (DNS rebind)", async () => {
    const evilResolver = async () => ["192.168.1.10"];
    await expect(assertSafeUrl("https://innocent.example.com", evilResolver)).rejects.toThrow(
      /private\/metadata IP'ye çözüldü/
    );
  });

  it("IPv6 loopback/ULA/link-local reddedilir", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
  });

  it("URL'de kimlik bilgisi reddedilir", async () => {
    await expect(assertSafeUrl("https://user:pass@example.com")).rejects.toThrow(SsrfBlockedError);
  });

  it("zincir ORTASINDA private redirect reddedilir (mid-chain)", async () => {
    const f = fakeFetch({
      "https://example.com/robots.txt": { status: 404 },
      "https://example.com/": {
        status: 302,
        headers: { location: "http://169.254.169.254/latest" },
      },
    });
    const r = await verifyWebsite("https://example.com/", {
      fetchImpl: f,
      resolveHost: publicResolver,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("SSRF");
  });

  it("redirect hop limiti (>5) aşılırsa reddedilir", async () => {
    const routes: Record<string, Route> = { "https://example.com/robots.txt": { status: 404 } };
    for (let i = 0; i <= 6; i++) {
      routes[`https://example.com/hop${i === 0 ? "" : i}`] = {
        status: 301,
        headers: { location: `https://example.com/hop${i + 1}` },
      };
    }
    routes["https://example.com/"] = { status: 301, headers: { location: "https://example.com/hop1" } };
    const r = await verifyWebsite("https://example.com/", {
      fetchImpl: fakeFetch(routes),
      resolveHost: publicResolver,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("redirect_hop_limit");
  });
});

// ── Tier-1 davranışı ─────────────────────────────────────────────────────────

describe("verifyWebsite — Tier 1 HTTP", () => {
  it("2xx → opens:true, render sinyalleri 'unknown', expiry +30g", async () => {
    const f = fakeFetch({
      "https://example.com/robots.txt": { status: 404 },
      "https://example.com/": {
        status: 200,
        headers: { "last-modified": "Tue, 01 Jul 2026 00:00:00 GMT" },
      },
    });
    const r = await verifyWebsite("https://example.com/", {
      fetchImpl: f,
      resolveHost: publicResolver,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.evidence.opens).toBe(true);
      expect(r.evidence.signupRequired).toBe("unknown");
      expect(r.evidence.lastUpdated).toContain("2026");
      const ttlDays =
        (r.evidence.expiry.getTime() - r.evidence.checkedAt.getTime()) / (24 * 60 * 60 * 1000);
      expect(Math.round(ttlDays)).toBe(30);
    }
  });

  it("Bard→Gemini regresyonu: redirect zinciri yakalanır, finalUrl hedefi gösterir", async () => {
    const f = fakeFetch({
      "https://bard.google.com/robots.txt": { status: 404 },
      "https://bard.google.com/": {
        status: 302,
        headers: { location: "https://gemini.google.com/" },
      },
      "https://gemini.google.com/": { status: 200 },
    });
    const r = await verifyWebsite("https://bard.google.com/", {
      fetchImpl: f,
      resolveHost: publicResolver,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.evidence.finalUrl).toContain("gemini.google.com");
      expect(r.evidence.redirectChain.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("404 → opens:false ama kanıt yine döner", async () => {
    const f = fakeFetch({
      "https://example.com/robots.txt": { status: 404 },
      "https://example.com/dead": { status: 404 },
    });
    const r = await verifyWebsite("https://example.com/dead", {
      fetchImpl: f,
      resolveHost: publicResolver,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.evidence.opens).toBe(false);
  });

  it("robots.txt Disallow eşleşirse doğrulama yapılmaz", async () => {
    const f = fakeFetch({
      "https://example.com/robots.txt": {
        status: 200,
        body: "User-agent: *\nDisallow: /private",
      },
      "https://example.com/private/tool": { status: 200 },
    });
    const r = await verifyWebsite("https://example.com/private/tool", {
      fetchImpl: f,
      resolveHost: publicResolver,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("robots_disallowed");
  });

  it("persist:true kanıtı WebsiteVerification'a yazar", async () => {
    const f = fakeFetch({
      "https://example.com/robots.txt": { status: 404 },
      "https://example.com/": { status: 200 },
    });
    const r = await verifyWebsite("https://example.com/", {
      fetchImpl: f,
      resolveHost: publicResolver,
      persist: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.verificationId).toBe("wv-1");
    expect(prisma.websiteVerification.create).toHaveBeenCalledTimes(1);
  });
});

describe("isDisallowedByRobots", () => {
  it("yalnız eşleşen path engellenir", () => {
    const robots = "User-agent: *\nDisallow: /admin";
    expect(isDisallowedByRobots(robots, "/admin/panel")).toBe(true);
    expect(isDisallowedByRobots(robots, "/tools")).toBe(false);
  });
  it("boş Disallow engel değildir", () => {
    expect(isDisallowedByRobots("User-agent: *\nDisallow:", "/x")).toBe(false);
  });
});
