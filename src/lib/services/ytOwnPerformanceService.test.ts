import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    ytChannel: { findFirst: vi.fn() },
    feedbackEvent: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/growth-engine/vector-memory", () => ({
  embedTrainingExample: vi.fn(),
}));
vi.mock("@/lib/youtube/ytClient", () => ({
  resolveHandle: vi.fn(),
  listUploads: vi.fn(),
  batchVideoStats: vi.fn(),
}));

import {
  judgeOwnVideos,
  ytOwnPerformanceService,
  type OwnVideoForJudge,
} from "@/lib/services/ytOwnPerformanceService";

const DAY = 86_400_000;
const NOW = 1_750_000_000_000;

function video(partial: Partial<OwnVideoForJudge>): OwnVideoForJudge {
  return {
    videoId: "v1",
    title: "test",
    url: "https://www.youtube.com/watch?v=v1",
    isShort: false,
    viewsPerDay: 100,
    publishedAtMs: NOW - 10 * DAY,
    viewCount: 1000,
    likeCount: 10,
    commentCount: 1,
    ...partial,
  };
}

describe("judgeOwnVideos — saf havuz + verdict mantığı", () => {
  const opts = { nowMs: NOW, highMin: 0.5, lowMax: -0.5 };

  it("Shorts ve long-form medyanlarını AYRI hesaplar", () => {
    const videos = [
      // Shorts havuzu: VPD 100, 100 → medyan 100
      video({ videoId: "s1", isShort: true, viewsPerDay: 100 }),
      video({ videoId: "s2", isShort: true, viewsPerDay: 100 }),
      // Long havuzu: VPD 10, 10 → medyan 10
      video({ videoId: "l1", isShort: false, viewsPerDay: 10 }),
      video({ videoId: "l2", isShort: false, viewsPerDay: 10 }),
      // VPD 20'lik long video: long medyanına göre outcome = (20-10)/10 = 1 → HIGH.
      // Shorts medyanıyla ölçülseydi (20-100)/100 = -0.8 → LOW olurdu.
      video({ videoId: "l3", isShort: false, viewsPerDay: 20 }),
    ];
    const verdicts = judgeOwnVideos(videos, opts);
    const l3 = verdicts.find((v) => v.video.videoId === "l3")!;
    expect(l3.poolMedianVpd).toBe(10);
    expect(l3.verdict).toBe("engagement_high");
  });

  it("outcome >= highMin → engagement_high", () => {
    const videos = [
      video({ videoId: "a", viewsPerDay: 10 }),
      video({ videoId: "b", viewsPerDay: 10 }),
      video({ videoId: "hot", viewsPerDay: 30 }), // (30-10)/10 = 2
    ];
    const hot = judgeOwnVideos(videos, opts).find((v) => v.video.videoId === "hot")!;
    expect(hot.outcome).toBe(2);
    expect(hot.verdict).toBe("engagement_high");
  });

  it("outcome <= lowMax + olgun video → engagement_low; taze video → null", () => {
    const base = [
      video({ videoId: "a", viewsPerDay: 100 }),
      video({ videoId: "b", viewsPerDay: 100 }),
    ];
    // (10-100)/100 = -0.9 → low bölgesi
    const mature = video({ videoId: "old", viewsPerDay: 10, publishedAtMs: NOW - 5 * DAY });
    const fresh = video({ videoId: "new", viewsPerDay: 10, publishedAtMs: NOW - DAY });

    const verdicts = judgeOwnVideos([...base, mature, fresh], opts);
    expect(verdicts.find((v) => v.video.videoId === "old")!.verdict).toBe("engagement_low");
    // 72 saatten taze — VPD gürültülü, henüz yargılanmaz.
    expect(verdicts.find((v) => v.video.videoId === "new")!.verdict).toBeNull();
  });

  it("havuz medyanı 0 ise (90g penceresinde havuz boş) verdict üretmez", () => {
    const shorts = [
      video({ videoId: "s1", isShort: true, viewsPerDay: 5 }),
      video({ videoId: "s2", isShort: true, viewsPerDay: 5 }),
    ];
    // Long video 90 gün penceresi DIŞINDA → long havuz medyanı 0 → guard.
    const outOfWindow = video({
      videoId: "ancient",
      isShort: false,
      viewsPerDay: 50,
      publishedAtMs: NOW - 200 * DAY,
    });
    const verdicts = judgeOwnVideos([...shorts, outOfWindow], { ...opts, highMin: 0.0001 });
    const ancient = verdicts.find((v) => v.video.videoId === "ancient")!;
    expect(ancient.poolMedianVpd).toBe(0);
    expect(ancient.verdict).toBeNull();
  });
});

describe("ytOwnPerformanceService.sync — fail-open", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("own-channel env'leri set değilse no-op döner (DB/API'ye dokunmaz)", async () => {
    vi.stubEnv("YT_OWN_CHANNEL_GRAFIKCEM", "");
    vi.stubEnv("YT_OWN_CHANNEL_MASKULENKOD", "");
    const summary = await ytOwnPerformanceService.sync();
    expect(summary.configured).toBe(false);
    expect(summary.reason).toBe("no_own_channel_env");
    expect(summary.channels).toBe(0);
  });

  it("env var ama YOUTUBE_API_KEY yoksa youtube_not_configured döner", async () => {
    vi.stubEnv("YT_OWN_CHANNEL_GRAFIKCEM", "@grafikcem");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const summary = await ytOwnPerformanceService.sync();
    expect(summary.configured).toBe(false);
    expect(summary.reason).toBe("youtube_not_configured");
  });
});
