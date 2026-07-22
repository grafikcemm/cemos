import { describe, it, expect, vi, beforeEach } from "vitest";

// A failed enrichment must never be persisted as an "active" RepoRadarItem.
vi.mock("@/lib/db/client", () => ({
  prisma: {
    repoRadarItem: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("@/lib/news/newsAi", () => ({ enrichRepo: vi.fn() }));

import { syncRepoRadar } from "./repoRadar";
import { prisma } from "@/lib/db/client";
import { enrichRepo } from "@/lib/news/newsAi";

const oneRepo = [
  {
    full_name: "o/r",
    name: "r",
    owner: { login: "o" },
    html_url: "https://github.com/o/r",
    description: "d",
    stargazers_count: 10,
    forks_count: 1,
    language: "TS",
    topics: [],
    pushed_at: null,
  },
];

function mockGithub(items: unknown[]) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ items }) })) as never;
}

describe("syncRepoRadar — a failed enrichment is never persisted as active", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips the write and counts an error when enrichment fails", async () => {
    mockGithub(oneRepo);
    vi.mocked(enrichRepo).mockResolvedValue({
      success: false,
      descriptionTr: "d",
      whyItMatters: "",
      bestFor: null,
      tweetHook: "",
      xValueScore: 0,
      modelUsed: null,
    });

    const res = await syncRepoRadar({ topics: ["ai"], maxRepos: 5 });

    expect(prisma.repoRadarItem.create).not.toHaveBeenCalled();
    expect(prisma.repoRadarItem.update).not.toHaveBeenCalled();
    expect(res.errors).toBe(1);
    expect(res.processed).toBe(0);
  });

  it("persists an enriched repo on success", async () => {
    mockGithub(oneRepo);
    vi.mocked(enrichRepo).mockResolvedValue({
      success: true,
      descriptionTr: "d",
      whyItMatters: "önemli",
      bestFor: null,
      tweetHook: "hook",
      xValueScore: 70,
      modelUsed: "m",
    });

    const res = await syncRepoRadar({ topics: ["ai"], maxRepos: 5 });

    expect(prisma.repoRadarItem.create).toHaveBeenCalledTimes(1);
    expect(res.processed).toBe(1);
  });
});
