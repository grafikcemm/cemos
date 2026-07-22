import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gözlenen Instagram DNA'sı (Phase 3A §C) — saf çekirdek + orkestratör.
 * Kritik: YAZMA YOK (mock'ta mutation metodu bile tanımlı değil — çağrılırsa
 * test patlar), eksik metrik sıfır sayılmaz, küçük örneklem kural üretmez.
 */

const igMediaFindMany = vi.fn();
const insightCount = vi.fn();
const bindingFindMany = vi.fn();
const accountFindUnique = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    igMedia: { findMany: (a: unknown) => igMediaFindMany(a) },
    igInsightSnapshot: { count: (a: unknown) => insightCount(a) },
    accountPlatformBinding: { findMany: (a: unknown) => bindingFindMany(a) },
    account: { findUnique: (a: unknown) => accountFindUnique(a) },
  },
}));

import {
  classifyCtaEnding,
  computeInstagramDnaObservation,
  getInstagramDnaObservation,
  splitCaptionBody,
  type ObservedMediaInput,
} from "./dnaObservationService";

const NOW = new Date("2026-07-17T12:00:00Z");

function media(overrides: Partial<ObservedMediaInput> = {}): ObservedMediaInput {
  return {
    mediaId: `m-${Math.random().toString(36).slice(2, 10)}`,
    caption: "Bugün 5 aracı test ettim.\n\nKaydet, sonra lazım olacak.\n\n#tasarim #ai",
    mediaType: "CAROUSEL_ALBUM",
    postedAt: new Date("2026-07-01T10:00:00Z"),
    likeCount: 0,
    commentCount: 0,
    ...overrides,
  };
}

describe("splitCaptionBody", () => {
  it("sondaki hashtag bloğunu gövdeden ayırır", () => {
    const r = splitCaptionBody("Gövde metni burada.\n\n#bir #iki\n#uc");
    expect(r.body).toBe("Gövde metni burada.");
    expect(r.tags).toEqual(["#bir", "#iki", "#uc"]);
    expect(r.inlineTagCount).toBe(0);
  });

  it("gövde içi hashtag'i inline sayar", () => {
    const r = splitCaptionBody("Bu #tasarim aracı harika.\nDevamı yarın.");
    expect(r.inlineTagCount).toBe(1);
    expect(r.body).toContain("#tasarim");
  });
});

describe("classifyCtaEnding", () => {
  it("soru / yönlendirme / yok sınıflar", () => {
    expect(classifyCtaEnding("Harika değil mi?")).toBe("soru");
    expect(classifyCtaEnding("Beğendiysen kaydet.")).toBe("yonlendirme");
    expect(classifyCtaEnding("Linki bio'da.")).toBe("yonlendirme");
    expect(classifyCtaEnding("Bugün böyleydi.")).toBe("yok");
  });
});

describe("computeInstagramDnaObservation (saf çekirdek)", () => {
  it("dağılımları, uzunlukları ve hashtag düzenini hesaplar", () => {
    const rows = [
      media({ mediaId: "a", caption: "Kaç araç denedin?\n\nKaydet.\n\n#ai #tasarim" }),
      media({ mediaId: "b", caption: "5 araç listeledim.\n\nTakip et.\n\n#ai #figma", mediaType: "REELS" }),
      media({ mediaId: "c", caption: "Sen de #ai kullan.\nYarın devamı var." }),
    ];
    const obs = computeInstagramDnaObservation(rows, { insightSnapshotCount: 0 });
    expect(obs.evidenceCount).toBe(3);
    expect(obs.mediaTypeDistribution).toEqual({ CAROUSEL_ALBUM: 2, REELS: 1 });
    expect(obs.hookDistribution.soru).toBe(1);
    expect(obs.hookDistribution.rakam).toBe(1);
    expect(obs.ctaEndingDistribution.yonlendirme).toBe(2);
    expect(obs.hashtag.placement).toBe("mixed"); // a,b sonda; c inline
    expect(obs.hashtag.casing).toBe("lower");
    expect(obs.hashtag.coreTags).toContain("#ai"); // 3 kez
    expect(obs.hashtag.countRange).toEqual({ min: 1, max: 2 });
    expect(obs.captionLength.min).toBeGreaterThan(0);
    expect(obs.sources.igMedia).toBe(3);
  });

  it("mediaId ve normalize içerik hash'iyle dedup yapar; boş caption hariç", () => {
    const rows = [
      media({ mediaId: "a", caption: "Ayni icerik burada." }),
      media({ mediaId: "a", caption: "Farklı ama aynı id." }), // id dupe
      media({ mediaId: "b", caption: "  AYNI   ICERIK   burada. " }), // içerik dupe (normalize)
      media({ mediaId: "c", caption: "" }), // boş
      media({ mediaId: "d", caption: "Benzersiz ikinci içerik." }),
    ];
    const obs = computeInstagramDnaObservation(rows, { insightSnapshotCount: 0 });
    expect(obs.evidenceCount).toBe(2);
  });

  it("küçük örneklem → insufficient + kural-çıkarma uyarısı", () => {
    const obs = computeInstagramDnaObservation([media()], { insightSnapshotCount: 0 });
    expect(obs.sampleSufficiency).toBe("insufficient");
    expect(obs.warnings.join(" ")).toContain("Örneklem yetersiz");
  });

  it("metrik yoksa unavailable — sıfır sayılmaz", () => {
    const obs = computeInstagramDnaObservation([media()], { insightSnapshotCount: 0 });
    expect(obs.performanceEvidence).toBe("unavailable");
    expect(obs.warnings.join(" ")).toContain("MEVCUT DEĞİL");
  });

  it("yalnız like/yorum → engagement_partial + virallik-değil uyarısı", () => {
    const obs = computeInstagramDnaObservation([media({ likeCount: 120 })], {
      insightSnapshotCount: 0,
    });
    expect(obs.performanceEvidence).toBe("engagement_partial");
    expect(obs.warnings.join(" ")).toContain("virallik kanıtı değildir");
  });

  it("insight snapshot varsa insights_available", () => {
    const obs = computeInstagramDnaObservation([media()], { insightSnapshotCount: 4 });
    expect(obs.performanceEvidence).toBe("insights_available");
  });
});

describe("getInstagramDnaObservation (orkestratör)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bindingFindMany.mockResolvedValue([
      {
        accountId: "acc-1",
        provider: "composio",
        externalHandle: "grafikcem",
        connectionStatus: "connected",
        lastVerifiedAt: NOW,
        lastSuccessfulSyncAt: NOW,
      },
    ]);
    accountFindUnique.mockResolvedValue({ id: "acc-1", handle: "grafikcem", isActive: true });
    insightCount.mockResolvedValue(0);
    igMediaFindMany.mockResolvedValue([media({ mediaId: "x1" }), media({ mediaId: "x2", caption: "İkinci farklı içerik.\n\n#ai" })]);
  });

  it("binding yoksa config_required geçirir, medya OKUMAZ", async () => {
    bindingFindMany.mockResolvedValue([]);
    const r = await getInstagramDnaObservation(NOW);
    expect(r.status).toBe("config_required");
    expect(igMediaFindMany).not.toHaveBeenCalled();
  });

  it("medya yoksa no_media", async () => {
    igMediaFindMany.mockResolvedValue([]);
    const r = await getInstagramDnaObservation(NOW);
    expect(r.status).toBe("no_media");
    expect(r.binding?.provider).toBe("composio");
  });

  it("gözlem hazır: bounded sorgu + hesap izolasyon sözleşmesi", async () => {
    const r = await getInstagramDnaObservation(NOW);
    expect(r.status).toBe("ok");
    expect(r.account?.handle).toBe("grafikcem");
    expect(r.observation?.evidenceCount).toBe(2);
    // Bounded: take ≤ 100.
    const q = igMediaFindMany.mock.calls[0][0] as { take: number };
    expect(q.take).toBeLessThanOrEqual(100);
  });

  it("bayat sync uyarısı ekler", async () => {
    bindingFindMany.mockResolvedValue([
      {
        accountId: "acc-1",
        provider: "composio",
        externalHandle: "grafikcem",
        connectionStatus: "connected",
        lastVerifiedAt: NOW,
        lastSuccessfulSyncAt: new Date("2026-06-01T00:00:00Z"),
      },
    ]);
    const r = await getInstagramDnaObservation(NOW);
    expect(r.binding?.staleSync).toBe(true);
    expect(r.observation?.warnings.join(" ")).toContain("bayat");
  });
});
