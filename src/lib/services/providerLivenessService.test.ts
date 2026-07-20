import { describe, it, expect, vi, beforeEach } from "vitest";

const usageFindFirst = vi.hoisted(() => vi.fn());
const exportFindFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({
  prisma: {
    usageLog: { findFirst: usageFindFirst },
    learnExportAttempt: { findFirst: exportFindFirst },
  },
}));

import { getProviderLiveness } from "./providerLivenessService";

const D = (iso: string) => new Date(iso);

beforeEach(() => {
  vi.clearAllMocks();
});

/** Route usageLog.findFirst by provider + success/failure branch. */
function usageMock(map: Record<string, { success?: Date; failure?: { at: Date; meta: string } }>) {
  usageFindFirst.mockImplementation((args: any) => {
    const provider: string = args.where.provider;
    const isFailureQuery = Boolean(args.where.meta?.contains);
    const entry = map[provider] ?? {};
    if (isFailureQuery) {
      return Promise.resolve(entry.failure ? { createdAt: entry.failure.at, meta: entry.failure.meta } : null);
    }
    return Promise.resolve(entry.success ? { createdAt: entry.success } : null);
  });
}

describe("getProviderLiveness", () => {
  beforeEach(() => {
    exportFindFirst.mockResolvedValue(null);
  });

  it("verified when a success exists and no newer failure", async () => {
    usageMock({ openrouter: { success: D("2026-07-20T10:00:00Z") } });
    const live = await getProviderLiveness();
    expect(live.openrouter.state).toBe("verified");
    expect(live.openrouter.lastSuccessAt).toBe("2026-07-20T10:00:00.000Z");
    expect(live.openrouter.lastFailureAt).toBeNull();
  });

  it("degraded when the last failure is newer than the last success, with errorClass", async () => {
    usageMock({
      openrouter: {
        success: D("2026-07-20T08:00:00Z"),
        failure: { at: D("2026-07-20T12:00:00Z"), meta: '{"failed":true,"errorClass":"provider_credit"}' },
      },
    });
    const live = await getProviderLiveness();
    expect(live.openrouter.state).toBe("degraded");
    expect(live.openrouter.lastErrorClass).toBe("provider_credit");
  });

  it("unknown when a provider was never called", async () => {
    usageMock({});
    const live = await getProviderLiveness();
    expect(live.fal.state).toBe("unknown");
    expect(live.socialdata.state).toBe("unknown");
  });

  it("derives obsidian channels from LearnExportAttempt", async () => {
    usageMock({});
    exportFindFirst.mockImplementation((args: any) => {
      const wantsSuccess = args.where.state.in.includes("succeeded");
      if (args.where.channel === "local_vault" && wantsSuccess) {
        return Promise.resolve({ startedAt: D("2026-07-19T09:00:00Z") });
      }
      return Promise.resolve(null);
    });
    const live = await getProviderLiveness();
    expect(live.obsidian_local.state).toBe("verified");
    expect(live.obsidian_github.state).toBe("unknown");
  });

  it("fails soft to {} on a DB error (panel keeps env-configured status)", async () => {
    usageFindFirst.mockRejectedValue(new Error("db down"));
    const live = await getProviderLiveness();
    expect(live).toEqual({});
  });
});
