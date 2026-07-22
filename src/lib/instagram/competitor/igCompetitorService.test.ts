import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    igWatchAccount: {
      upsert: vi.fn(((args: { create: object }) =>
        Promise.resolve({ id: "w-1", probeError: "API'den alınamıyor — manuel ekle (personal/private hesap olabilir)", ...args.create })) as never),
      findMany: vi.fn(() => Promise.resolve([])),
      update: vi.fn(() => Promise.resolve({})),
      count: vi.fn(() => Promise.resolve(0)),
    },
    creator: {
      upsert: vi.fn(() => Promise.resolve({ id: "cr-1" })),
    },
    contentItem: {
      upsert: vi.fn(() => Promise.resolve({ id: "ci-1" })),
    },
    creatorBaseline: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      upsert: vi.fn(() => Promise.resolve({})),
    },
    contentOutlierScore: {
      upsert: vi.fn(() => Promise.resolve({})),
    },
  },
}));
vi.mock("@/lib/instagram/igClient", () => ({
  getBusinessDiscovery: vi.fn(),
  getEffectiveToken: vi.fn(() => Promise.resolve({ token: "mock-token", source: "env" })),
}));

import { prisma } from "@/lib/db/client";
import { getBusinessDiscovery, getEffectiveToken } from "@/lib/instagram/igClient";
import {
  addWatchAccount,
  syncIgCompetitors,
  igFormatOf,
  igOutlierMultiplier,
  median,
  IG_WATCHLIST_MAX,
} from "./igCompetitorService";

const mockBd = vi.mocked(getBusinessDiscovery);
const mockToken = vi.mocked(getEffectiveToken);
const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  mockToken.mockResolvedValue({ token: "mock-token", source: "env" } as never);
  process.env.META_IG_USER_ID = "1784100000000000";
});

afterEach(() => {
  delete process.env.META_IG_USER_ID;
});

describe("igFormatOf / median / outlier matematiği", () => {
  it("REELS → ig_reel, CAROUSEL_ALBUM → ig_carousel, IMAGE → ig_static", () => {
    expect(igFormatOf({ media_product_type: "REELS", media_type: "VIDEO" })).toBe("ig_reel");
    expect(igFormatOf({ media_type: "CAROUSEL_ALBUM" })).toBe("ig_carousel");
    expect(igFormatOf({ media_type: "IMAGE" })).toBe("ig_static");
  });

  it("median tek/çift dizide doğru", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("outlier: taze içerik tam çarpan, eski içerik 0.5 tabanına iner", () => {
    const now = Date.now();
    const fresh = igOutlierMultiplier({
      engagement: 200, baselineMedian: 100, publishedAtMs: now - 2 * DAY, nowMs: now,
    });
    const old = igOutlierMultiplier({
      engagement: 200, baselineMedian: 100, publishedAtMs: now - 120 * DAY, nowMs: now,
    });
    expect(fresh).toBe(2);
    expect(old).toBe(1); // 2 × taban 0.5
  });

  it("sıfır medyan sonlu skor üretir (EPSILON)", () => {
    const s = igOutlierMultiplier({
      engagement: 50, baselineMedian: 0, publishedAtMs: Date.now(), nowMs: Date.now(),
    });
    expect(Number.isFinite(s)).toBe(true);
  });
});

describe("addWatchAccount — probe akışı", () => {
  it("public professional hesap → Creator + probeStatus ok", async () => {
    mockBd.mockResolvedValue({
      ok: true,
      data: { username: "rakip", followers_count: 5000, media: [] },
    } as never);
    const r = await addWatchAccount("@Rakip");
    expect(r.probeStatus).toBe("ok");
    expect(prisma.creator.upsert).toHaveBeenCalled();
  });

  it("private/personal hesap → THROW DEĞİL, Türkçe manuel-ekle bayrağı", async () => {
    mockBd.mockResolvedValue({ ok: false, error: "meta_400: not a business" } as never);
    const r = await addWatchAccount("gizlihesap");
    expect(r.probeStatus).toBe("unavailable");
    if (r.probeStatus === "unavailable") expect(r.message).toContain("manuel ekle");
    expect(prisma.creator.upsert).not.toHaveBeenCalled();
  });

  it("Meta yapılandırılmamış → DÜRÜST config_required (private yalanı YOK)", async () => {
    mockBd.mockResolvedValue({ ok: false, error: "not_configured" } as never);
    const r = await addWatchAccount("rakip");
    expect(r.probeStatus).toBe("config_required");
    if (r.probeStatus === "config_required") {
      expect(r.message).toContain("yapılandırılmamış");
      expect(r.message).not.toContain("private");
    }
    const upsert = vi.mocked(prisma.igWatchAccount.upsert).mock.calls[0][0];
    expect((upsert.create as { probeStatus: string }).probeStatus).toBe("config_required");
  });

  it("geçersiz handle reddedilir (normalize + validasyon)", async () => {
    await expect(addWatchAccount("Rakip Hesap!")).rejects.toThrow("Geçersiz");
    expect(mockBd).not.toHaveBeenCalled();
  });
});

describe("syncIgCompetitors — günlük LLM'siz sync (iki aşamalı)", () => {
  it("Meta yapılandırılmamışsa fail-fast: sıfır API çağrısı, dürüst skipped", async () => {
    delete process.env.META_IG_USER_ID;
    const r = await syncIgCompetitors();
    expect(r.skipped).toBe("meta_config_required");
    expect(mockBd).not.toHaveBeenCalled();
    expect(prisma.igWatchAccount.findMany).not.toHaveBeenCalled();
  });

  it("watchlist boşsa hiçbir API çağrısı yapmaz", async () => {
    const r = await syncIgCompetitors();
    expect(r.accounts).toBe(0);
    expect(mockBd).not.toHaveBeenCalled();
  });

  it("skor GÜNCEL baseline ile yazılır (iki aşama); yeterli örneklemde insufficient=false", async () => {
    vi.mocked(prisma.igWatchAccount.findMany).mockResolvedValue([
      { id: "w-1", username: "rakip", creatorId: "cr-1", lastSyncAt: null },
    ] as never);
    let ci = 0;
    vi.mocked(prisma.contentItem.upsert).mockImplementation((() =>
      Promise.resolve({ id: `ci-${++ci}` })) as never);
    const now = new Date().toISOString();
    // 5 medya (BASELINE_MIN_SAMPLE) — engagement 10,20,30,40,50 → medyan 30.
    mockBd.mockResolvedValue({
      ok: true,
      data: {
        username: "rakip",
        media: [10, 20, 30, 40, 50].map((likes, i) => ({
          id: `m${i}`, media_type: "VIDEO", media_product_type: "REELS",
          like_count: likes, comments_count: 0, timestamp: now, permalink: `https://ig/p/m${i}`,
        })),
      },
    } as never);
    const r = await syncIgCompetitors({ deadlineMs: 30_000 });
    expect(r.synced).toBe(1);
    expect(r.itemsUpserted).toBe(5);
    expect(r.outliersScored).toBe(5);
    // Baseline SKORLARDAN ÖNCE upsert edildi ve skorlar taze medyanı kullandı.
    const scoreCalls = vi.mocked(prisma.contentOutlierScore.upsert).mock.calls;
    for (const [args] of scoreCalls) {
      const create = (args as { create: { baselineMedian: number; insufficient: boolean; sampleSize: number; explanationJson: string } }).create;
      expect(create.baselineMedian).toBe(30);
      expect(create.sampleSize).toBe(5);
      expect(create.insufficient).toBe(false);
      const exp = JSON.parse(create.explanationJson);
      expect(exp.metricProvenance).toBe("meta_business_discovery");
      expect(exp.sampleSize).toBe(5);
      expect(exp.computedAt).toBeTruthy();
    }
    // Eski akıştaki bayat-baseline okuması artık YOK.
    expect(prisma.creatorBaseline.findUnique).not.toHaveBeenCalled();
    expect(prisma.igWatchAccount.update).toHaveBeenCalled();
  });

  it("yetersiz örneklem → multiplier=0 + insufficient=true (EPSILON şişirmesi yok)", async () => {
    vi.mocked(prisma.igWatchAccount.findMany).mockResolvedValue([
      { id: "w-1", username: "rakip", creatorId: "cr-1", lastSyncAt: null },
    ] as never);
    mockBd.mockResolvedValue({
      ok: true,
      data: {
        username: "rakip",
        media: [{
          id: "m1", media_type: "VIDEO", media_product_type: "REELS",
          like_count: 100, comments_count: 10,
          timestamp: new Date().toISOString(), permalink: "https://ig/p/m1",
        }],
      },
    } as never);
    const r = await syncIgCompetitors({ deadlineMs: 30_000 });
    expect(r.outliersScored).toBe(1);
    const [args] = vi.mocked(prisma.contentOutlierScore.upsert).mock.calls[0];
    const create = (args as { create: { multiplier: number; insufficient: boolean } }).create;
    expect(create.insufficient).toBe(true);
    expect(create.multiplier).toBe(0);
  });

  it("watchlist günlük sınırı IG_WATCHLIST_MAX ile çekilir", async () => {
    await syncIgCompetitors();
    const arg = vi.mocked(prisma.igWatchAccount.findMany).mock.calls[0][0];
    expect(arg).toMatchObject({ take: IG_WATCHLIST_MAX });
  });

  it("API hatası hesabı errors'a yazar, sync devam eder (fail-open)", async () => {
    vi.mocked(prisma.igWatchAccount.findMany).mockResolvedValue([
      { id: "w-1", username: "a", creatorId: "cr-1", lastSyncAt: null },
      { id: "w-2", username: "b", creatorId: "cr-2", lastSyncAt: null },
    ] as never);
    mockBd
      .mockResolvedValueOnce({ ok: false, error: "meta_500" } as never)
      .mockResolvedValueOnce({ ok: true, data: { username: "b", media: [] } } as never);
    const r = await syncIgCompetitors({ deadlineMs: 30_000 });
    expect(r.errors).toHaveLength(1);
    expect(r.synced).toBe(1);
  });
});
