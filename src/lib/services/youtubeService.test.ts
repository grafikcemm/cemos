import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { youtubeService } from "./youtubeService";
import { ytChannelRepo } from "@/lib/db/ytChannelRepo";
import { listUploads, batchVideoStats } from "@/lib/youtube/ytClient";

vi.mock("@/lib/db/ytChannelRepo", () => ({
  ytChannelRepo: {
    count: vi.fn(() => Promise.resolve(2)), // non-zero → seed atlanır
    existingHandles: vi.fn(() => Promise.resolve([])),
    listEnabledCompetitors: vi.fn(() => Promise.resolve([])),
    markSynced: vi.fn(() => Promise.resolve({})),
    markError: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock("@/lib/db/ytVideoRepo", () => ({
  ytVideoRepo: { upsertByVideoId: vi.fn(() => Promise.resolve({})) },
}));
vi.mock("@/lib/youtube/ytClient", () => ({
  resolveHandle: vi.fn(),
  listUploads: vi.fn(),
  batchVideoStats: vi.fn(),
}));

const CH = (channelId: string) => ({
  channelId,
  uploadsPlaylistId: `UU_${channelId}`,
  rollingMedianVpd: 0,
});

describe("youtubeService.syncCompetitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YOUTUBE_API_KEY = "test-key";
    vi.mocked(ytChannelRepo.count).mockResolvedValue(2);
    vi.mocked(ytChannelRepo.listEnabledCompetitors).mockResolvedValue([
      CH("c1"),
      CH("c2"),
    ] as never);
  });

  afterEach(() => {
    delete process.env.YOUTUBE_API_KEY;
  });

  it("deadline 0 → tüm kanallar atlanır, API çağrılmaz", async () => {
    const res = await youtubeService.syncCompetitors({ deadlineMs: 0 });
    expect(res.skippedForDeadline).toBe(2);
    expect(res.channelsSynced).toBe(0);
    expect(listUploads).not.toHaveBeenCalled();
  });

  it("bir kanal patlarsa markError + sonraki kanala devam eder", async () => {
    vi.mocked(listUploads)
      .mockImplementationOnce(() => Promise.reject(new Error("c1 patladı")))
      .mockResolvedValueOnce({ ok: true, data: [], quotaUnits: 1 } as never);
    vi.mocked(batchVideoStats).mockResolvedValue({ ok: true, data: [], quotaUnits: 0 } as never);

    const res = await youtubeService.syncCompetitors({ deadlineMs: 60_000 });
    expect(res.errors).toBe(1);
    expect(ytChannelRepo.markError).toHaveBeenCalledWith(
      "c1",
      expect.stringContaining("c1 patladı")
    );
    expect(res.channelsSynced).toBe(1); // c2 boş uploads → yine synced
  });

  it("API key yoksa fail-open boş sonuç (configured:false)", async () => {
    delete process.env.YOUTUBE_API_KEY;
    const res = await youtubeService.syncCompetitors({ deadlineMs: 60_000 });
    expect(res.configured).toBe(false);
    expect(res.channelsSynced).toBe(0);
  });
});

describe("youtubeService kaynak güvenliği", () => {
  it("rutin sync modülü search.list (searchChannels) import ETMEZ", () => {
    const src = readFileSync(path.resolve(__dirname, "youtubeService.ts"), "utf-8");
    expect(src.includes("searchChannels")).toBe(false);
  });
});
