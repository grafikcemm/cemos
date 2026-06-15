import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NormalizedItem } from "@/lib/sources/types";

// Control the SocialData fallback connector so we can assert delegation without
// hitting the network or a real API key.
const fallbackItems: NormalizedItem[] = [
  { sourceType: "x", externalId: "fallback-1", text: "socialdata sonucu", url: "u", engagementScore: 5, sourceWeight: 0.9 },
];
const fetchForAccount = vi.fn(async () => fallbackItems);
const isConfigured = vi.fn(() => false);

vi.mock("@/lib/sources/x", () => ({
  xConnector: {
    type: "x",
    isConfigured: () => isConfigured(),
    fetchForAccount: (...args: unknown[]) => fetchForAccount(...(args as [])),
  },
}));

import { xScraperConnector } from "@/lib/sources/xScraper";

describe("xScraperConnector", () => {
  const original = process.env.X_SCRAPER_ENABLED;

  beforeEach(() => {
    fetchForAccount.mockClear();
    isConfigured.mockClear();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.X_SCRAPER_ENABLED;
    else process.env.X_SCRAPER_ENABLED = original;
  });

  it("delegates to the SocialData fallback when the scraper is disabled", async () => {
    delete process.env.X_SCRAPER_ENABLED;
    const res = await xScraperConnector.fetchForAccount("grafikcem", 10);
    expect(fetchForAccount).toHaveBeenCalledOnce();
    expect(res).toEqual(fallbackItems);
  });

  it("is configured when the free scraper is enabled even without a SocialData key", () => {
    process.env.X_SCRAPER_ENABLED = "true";
    isConfigured.mockReturnValue(false);
    expect(xScraperConnector.isConfigured()).toBe(true);
  });

  it("is configured when only the SocialData key is present", () => {
    delete process.env.X_SCRAPER_ENABLED;
    isConfigured.mockReturnValue(true);
    expect(xScraperConnector.isConfigured()).toBe(true);
  });

  it("is not configured when neither the scraper nor a SocialData key is available", () => {
    delete process.env.X_SCRAPER_ENABLED;
    isConfigured.mockReturnValue(false);
    expect(xScraperConnector.isConfigured()).toBe(false);
  });

  it("exposes the x source type", () => {
    expect(xScraperConnector.type).toBe("x");
  });
});
