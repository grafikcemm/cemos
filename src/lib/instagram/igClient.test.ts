import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/integrationCredentialRepo", () => ({
  integrationCredentialRepo: { get: vi.fn(), upsert: vi.fn() },
}));

import {
  computeTokenStatus,
  getEffectiveToken,
  isConfigured,
  getRecentMedia,
  refreshLongLivedToken,
} from "./igClient";
import { integrationCredentialRepo } from "@/lib/db/integrationCredentialRepo";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

describe("computeTokenStatus (saf)", () => {
  it("null expiresAt → unknown", () => {
    expect(computeTokenStatus(null, NOW)).toEqual({ daysUntilExpiry: null, status: "unknown" });
  });
  it(">10 gün → ok", () => {
    expect(computeTokenStatus(new Date(NOW + 30 * DAY), NOW).status).toBe("ok");
  });
  it("tam 10 gün → warn", () => {
    expect(computeTokenStatus(new Date(NOW + 10 * DAY), NOW).status).toBe("warn");
  });
  it("tam 3 gün → critical", () => {
    expect(computeTokenStatus(new Date(NOW + 3 * DAY), NOW).status).toBe("critical");
  });
  it("süresi dolmuş (negatif gün) → critical", () => {
    const r = computeTokenStatus(new Date(NOW - 5 * DAY), NOW);
    expect(r.status).toBe("critical");
    expect(r.daysUntilExpiry).toBeLessThan(0);
  });
});

describe("getEffectiveToken (DB → env)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.META_ACCESS_TOKEN;
  });
  it("DB değeri varsa source:db", async () => {
    vi.mocked(integrationCredentialRepo.get).mockResolvedValue({ value: "db-token" } as never);
    expect(await getEffectiveToken()).toEqual({ token: "db-token", source: "db" });
  });
  it("DB boş + env varsa source:env", async () => {
    vi.mocked(integrationCredentialRepo.get).mockResolvedValue(null);
    process.env.META_ACCESS_TOKEN = "env-token";
    expect(await getEffectiveToken()).toEqual({ token: "env-token", source: "env" });
  });
  it("DB throw → env fallback", async () => {
    vi.mocked(integrationCredentialRepo.get).mockRejectedValue(new Error("db down"));
    process.env.META_ACCESS_TOKEN = "env-token";
    expect((await getEffectiveToken()).source).toBe("env");
  });
  it("ikisi de yoksa none", async () => {
    vi.mocked(integrationCredentialRepo.get).mockResolvedValue(null);
    expect(await getEffectiveToken()).toEqual({ token: null, source: "none" });
  });
});

describe("isConfigured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(integrationCredentialRepo.get).mockResolvedValue({ value: "t" } as never);
    process.env.META_IG_USER_ID = "ig1";
    process.env.META_APP_ID = "app1";
    process.env.META_APP_SECRET = "sec1";
  });
  afterEach(() => {
    delete process.env.META_IG_USER_ID;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });
  it("hepsi varsa true", async () => {
    expect(await isConfigured()).toBe(true);
  });
  it("app secret yoksa false", async () => {
    delete process.env.META_APP_SECRET;
    expect(await isConfigured()).toBe(false);
  });
});

describe("getRecentMedia fail-open + URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(integrationCredentialRepo.get).mockResolvedValue({ value: "TOKEN" } as never);
    process.env.META_IG_USER_ID = "IG123";
  });
  afterEach(() => {
    delete process.env.META_IG_USER_ID;
    vi.unstubAllGlobals();
  });
  it("doğru endpoint + 200 → data", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: "m1" }] }) })
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await getRecentMedia(5);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual([{ id: "m1" }]);
    const url = (fetchMock.mock.calls[0] as unknown[])?.[0] as string;
    expect(url).toContain("/IG123/media");
    expect(url).toContain("access_token=TOKEN");
  });
  it("non-200 → fail-open {ok:false}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve("bad") }))
    );
    const r = await getRecentMedia(5);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("meta_400");
  });
  it("network throw → fail-open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("net")))
    );
    expect((await getRecentMedia(5)).ok).toBe(false);
  });
});

describe("refreshLongLivedToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(integrationCredentialRepo.get).mockResolvedValue({ value: "OLD" } as never);
    vi.mocked(integrationCredentialRepo.upsert).mockResolvedValue({} as never);
    process.env.META_APP_ID = "app1";
    process.env.META_APP_SECRET = "sec1";
  });
  afterEach(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    vi.unstubAllGlobals();
  });
  it("başarı → upsert(meta_access_token, NEW, expiresAt:Date)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: "NEW", expires_in: 5_184_000 }),
        })
      )
    );
    const r = await refreshLongLivedToken();
    expect(r.ok).toBe(true);
    expect(integrationCredentialRepo.upsert).toHaveBeenCalledWith(
      "meta_access_token",
      "NEW",
      expect.objectContaining({ expiresAt: expect.any(Date) })
    );
  });
  it("yanıtta token yoksa fail-open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
    );
    expect((await refreshLongLivedToken()).ok).toBe(false);
  });
});
