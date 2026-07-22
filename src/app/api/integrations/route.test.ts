import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/sameOriginGuard", () => ({
  isOperatorOrCronAuthorized: vi.fn(() => true),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: vi.fn(async () => null) },
    accountPlatformBinding: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock("@/lib/composio/config", () => ({
  getComposioConfig: vi.fn(() => ({
    configured: false,
    provider: "auto",
    accountHandle: "",
    toolkitVersion: "",
  })),
  missingComposioEnvNames: vi.fn(() => []),
}));

vi.mock("@/lib/services/providerLivenessService", () => ({
  UNKNOWN_LIVENESS: { status: "unknown" },
  getProviderLiveness: vi.fn(async () => ({})),
}));

import { GET } from "./route";

describe("integration provider inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies Tier-2 as an unimplemented product capability, not a false Vercel limitation", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/integrations"));
    const body = await response.json();
    const tier2 = body.providers.find(
      (provider: { key: string }) => provider.key === "tier2_worker",
    );

    expect(response.status).toBe(200);
    expect(tier2).toMatchObject({
      status: "blocked",
      envNames: [],
    });
    expect(tier2.note).toContain("henüz uygulanmadı");
    expect(tier2.note).toContain("Vercel Workflows");
    expect(tier2.note).not.toContain("ayrı deploy gerekir");
    expect(tier2.note).not.toContain("Vercel serverless uzun-iş çalıştırmaz");
  });
});
