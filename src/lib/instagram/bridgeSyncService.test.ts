import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    accountPlatformBinding: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/db/igMediaRepo", () => ({
  igMediaRepo: { upsertByMediaId: vi.fn(), getByMediaId: vi.fn() },
}));
vi.mock("@/lib/db/igCommentRepo", () => ({
  igCommentRepo: { upsertByCommentId: vi.fn() },
}));
vi.mock("@/lib/db/igInsightSnapshotRepo", () => ({
  igInsightSnapshotRepo: { getByDate: vi.fn(), upsertByDate: vi.fn() },
}));
vi.mock("@/lib/accounts/profileRepository", () => ({
  isKnownAccountHandleDb: vi.fn(),
}));
vi.mock("@/lib/instagram/providers/select", () => ({
  selectInstagramReadProvider: vi.fn(),
}));
vi.mock("@/lib/content/normalizer", () => ({
  fromIgMedia: vi.fn((row: { mediaId: string }) => ({ platform: "instagram", externalId: row.mediaId })),
}));
vi.mock("@/lib/content/ingestService", () => ({
  ingestContent: vi.fn(async () => ({ id: "ci-1" })),
}));

import { prisma } from "@/lib/db/client";
import { igMediaRepo } from "@/lib/db/igMediaRepo";
import { igCommentRepo } from "@/lib/db/igCommentRepo";
import { igInsightSnapshotRepo } from "@/lib/db/igInsightSnapshotRepo";
import { isKnownAccountHandleDb } from "@/lib/accounts/profileRepository";
import { selectInstagramReadProvider } from "@/lib/instagram/providers/select";
import { ingestContent } from "@/lib/content/ingestService";
import { syncInstagramViaBridge } from "@/lib/instagram/bridgeSyncService";
import type { InstagramReadProvider } from "@/lib/instagram/providers/types";

function fakeProvider(overrides: Partial<InstagramReadProvider> = {}): InstagramReadProvider {
  return {
    id: "composio",
    healthCheck: vi.fn(async () => ({ healthy: true, connectionState: "connected" })),
    getOwnProfile: vi.fn(async () => ({
      igUserId: "1784",
      username: "grafikcem",
      name: "GrafikCem",
      followersCount: 94000,
      mediaCount: 500,
    })),
    listOwnMedia: vi.fn(async () => [
      {
        mediaId: "m1",
        caption: "reels",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://ig/m1",
        timestamp: "2026-07-16T09:00:00+0000",
        likeCount: 100,
        commentsCount: 4,
      },
    ]),
    getMediaInsights: vi.fn(async () => ({
      mediaId: "m1",
      reach: 5000,
      views: 8000,
      likes: 100,
      comments: 4,
      saves: 20,
      shares: 9,
    })),
    getAccountInsights: vi.fn(async () => ({
      reach: 12000,
      views: 20000,
      accountsEngaged: 900,
      likes: 400,
      comments: 30,
      saves: 60,
      shares: 25,
      followersCount: 94000,
    })),
    listMediaComments: vi.fn(async () => [
      { commentId: "c1", mediaId: "m1", parentCommentId: null, username: "fan", text: "süper", timestamp: "" },
    ]),
    ...overrides,
  };
}

function selection(provider: InstagramReadProvider | null, extra: Record<string, unknown> = {}) {
  return {
    provider,
    providerId: provider ? provider.id : "none",
    mode: "auto",
    fallbackUsed: false,
    composioHealth: { healthy: Boolean(provider), connectionState: provider ? "connected" : "unconfigured" },
    ...extra,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COMPOSIO_CONSUMER_API_KEY", "test-key-not-real");
  vi.stubEnv("COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID", "ca_test123");
  vi.stubEnv("COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE", "grafikcem");
  vi.stubEnv("COMPOSIO_INSTAGRAM_TOOLKIT_VERSION", "20260708_00");
  vi.mocked(isKnownAccountHandleDb).mockResolvedValue(true);
  vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: "acc-1" } as never);
  vi.mocked(prisma.accountPlatformBinding.upsert).mockResolvedValue({} as never);
  vi.mocked(igMediaRepo.upsertByMediaId).mockResolvedValue({} as never);
  vi.mocked(igMediaRepo.getByMediaId).mockResolvedValue({ id: "row-1", mediaId: "m1" } as never);
  vi.mocked(igCommentRepo.upsertByCommentId).mockResolvedValue({} as never);
  vi.mocked(igInsightSnapshotRepo.getByDate).mockResolvedValue(null as never);
  vi.mocked(igInsightSnapshotRepo.upsertByDate).mockResolvedValue({} as never);
});

afterEach(() => vi.unstubAllEnvs());

describe("bridgeSyncService — binding fail-closed (ADR-032)", () => {
  it("binding env'i yoksa sync HİÇ başlamaz", async () => {
    vi.stubEnv("COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE", "");
    const r = await syncInstagramViaBridge();
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe("binding_missing");
    expect(selectInstagramReadProvider).not.toHaveBeenCalled();
    expect(igMediaRepo.upsertByMediaId).not.toHaveBeenCalled();
  });

  it("handle DB'de aktif hesaba çözülemiyorsa fail-closed (blocked)", async () => {
    vi.mocked(isKnownAccountHandleDb).mockResolvedValue(false);
    const r = await syncInstagramViaBridge();
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe("binding_invalid");
    expect(r.connectionState).toBe("blocked");
    expect(igMediaRepo.upsertByMediaId).not.toHaveBeenCalled();
  });

  it("DB'ye ulaşılamıyorsa binding doğrulanamaz — sync durur (yanlış hesaba yazım imkânsız)", async () => {
    vi.mocked(isKnownAccountHandleDb).mockRejectedValue(new Error("db down"));
    const r = await syncInstagramViaBridge();
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe("binding_unverifiable");
  });
});

describe("bridgeSyncService — başarılı sync + idempotency", () => {
  it("medya/yorum external-ID anahtarlı upsert; insight günde 1; içerik köprüsü sayılır", async () => {
    vi.mocked(selectInstagramReadProvider).mockResolvedValue(selection(fakeProvider()));
    const r = await syncInstagramViaBridge();
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("composio");
    expect(r.mediaUpserted).toBe(1);
    expect(r.commentsUpserted).toBe(1);
    expect(r.insightCaptured).toBe(true);
    expect(r.contentBridged).toBe(1);
    expect(r.externalUsername).toBe("grafikcem");
    // dedupe anahtarı: mediaId / commentId
    expect(igMediaRepo.upsertByMediaId).toHaveBeenCalledWith(expect.objectContaining({ mediaId: "m1" }));
    expect(igCommentRepo.upsertByCommentId).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: "c1", mediaId: "m1" })
    );
    expect(ingestContent).toHaveBeenCalledTimes(1);
    // binding persist: secret YOK, sayaç + kimlik VAR
    const bindArgs = vi.mocked(prisma.accountPlatformBinding.upsert).mock.calls[0][0] as {
      create: Record<string, unknown>;
    };
    const serialized = JSON.stringify(bindArgs);
    expect(serialized).not.toContain("test-key-not-real");
    expect(bindArgs.create.externalHandle).toBe("grafikcem");
  });

  it("aynı gün ikinci koşu: insight snapshot zaten varsa yeniden YAZILMAZ", async () => {
    vi.mocked(selectInstagramReadProvider).mockResolvedValue(selection(fakeProvider()));
    vi.mocked(igInsightSnapshotRepo.getByDate).mockResolvedValue({ id: "snap" } as never);
    const r = await syncInstagramViaBridge();
    expect(r.insightCaptured).toBe(false);
    expect(igInsightSnapshotRepo.upsertByDate).not.toHaveBeenCalled();
    // medya upsert yine koşar (idempotent — duplicate yaratmaz)
    expect(igMediaRepo.upsertByMediaId).toHaveBeenCalled();
  });

  it("fallback seçimi sonuçta İŞARETLİ taşınır", async () => {
    const meta = fakeProvider({ id: "meta" });
    vi.mocked(selectInstagramReadProvider).mockResolvedValue(
      selection(meta, { providerId: "meta", fallbackUsed: true, fallbackReason: "composio_unauthorized" })
    );
    const r = await syncInstagramViaBridge();
    expect(r.provider).toBe("meta");
    expect(r.fallbackUsed).toBe(true);
    expect(r.fallbackReason).toBe("composio_unauthorized");
  });
});

describe("bridgeSyncService — dürüst hata durumları", () => {
  it("hiçbir provider yoksa dürüst sonuç (sahte başarı yok)", async () => {
    vi.mocked(selectInstagramReadProvider).mockResolvedValue(
      selection(null, { fallbackReason: "composio_not_configured+meta_not_configured" })
    );
    const r = await syncInstagramViaBridge();
    expect(r.ok).toBe(false);
    expect(r.provider).toBe("none");
    expect(r.mediaUpserted).toBe(0);
  });

  it("medya fetch hatası: ok=false + errorClass; yorum aşaması koşmaz", async () => {
    const p = fakeProvider({
      listOwnMedia: vi.fn(async () => {
        throw Object.assign(new Error("rate limit"), { errorClass: "rate_limited" });
      }),
    });
    vi.mocked(selectInstagramReadProvider).mockResolvedValue(selection(p));
    const r = await syncInstagramViaBridge();
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe("rate_limited");
    expect(igCommentRepo.upsertByCommentId).not.toHaveBeenCalled();
  });

  it("kısmi insight: media-insight null olsa da account-insight varsa snapshot yazılır", async () => {
    const p = fakeProvider({ getMediaInsights: vi.fn(async () => null) });
    vi.mocked(selectInstagramReadProvider).mockResolvedValue(selection(p));
    const r = await syncInstagramViaBridge();
    expect(r.ok).toBe(true);
    // Hesap-seviyesi insight yakalandı (per-media insight boş olsa da).
    expect(r.insightCaptured).toBe(true);
  });

  it("account-insight null → insightCaptured=false + UYARI (sessiz değil; UI 'zaten alındı' sanmaz)", async () => {
    const p = fakeProvider({ getAccountInsights: vi.fn(async () => null) });
    vi.mocked(selectInstagramReadProvider).mockResolvedValue(selection(p));
    const r = await syncInstagramViaBridge();
    // Sync yine başarır (diğer aşamalar) ama hesap insight'ı yoksa insightCaptured
    // false ve all-zero snapshot YAZILMAZ → aynı gün başarılı retry yakalayabilir.
    expect(r.ok).toBe(true);
    expect(r.insightCaptured).toBe(false);
    expect(igInsightSnapshotRepo.upsertByDate).not.toHaveBeenCalled();
    // getAccountInsights sözleşme-kayması/boş null döndürdüğünde SESSİZ geçme:
    // uyarı bunu görünür kılar (aksi hâlde UI insightCaptured=false'u "bugün zaten
    // alınmış" idempotent-skip ile karıştırır → sahte güvence).
    expect(r.warnings.some((w) => w.includes("hesap-seviyesi insight"))).toBe(true);
  });

  it("deadline geçmişse medya döngüsü DURUR → dürüst partial (serverless hard-kill yerine)", async () => {
    vi.mocked(selectInstagramReadProvider).mockResolvedValue(selection(fakeProvider()));
    const r = await syncInstagramViaBridge({ deadlineMs: Date.now() - 1 });
    // Bütçe zaten dolu → hiç medya işlenmez, partial işaretlenir, uyarı görünür,
    // insight aşaması da atlanır (ek RPC yok). Sync NORMAL döner → çağıran CronRun'ı
    // "başladı-bitmedi" bırakmaz.
    expect(r.partial).toBe(true);
    expect(r.mediaUpserted).toBe(0);
    expect(r.warnings.some((w) => w.startsWith("deadline"))).toBe(true);
    expect(igInsightSnapshotRepo.upsertByDate).not.toHaveBeenCalled();
  });

  it("tek yorum upsert hatası sync'i öldürmez — warning'e düşer", async () => {
    vi.mocked(selectInstagramReadProvider).mockResolvedValue(selection(fakeProvider()));
    vi.mocked(igCommentRepo.upsertByCommentId).mockRejectedValue(new Error("db glitch"));
    const r = await syncInstagramViaBridge();
    expect(r.ok).toBe(true);
    expect(r.commentsUpserted).toBe(0);
    expect(r.warnings.some((w) => w.startsWith("comment:c1"))).toBe(true);
  });
});
