import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/instagram/igClient", () => ({
  isConfigured: vi.fn(),
  validateToken: vi.fn(),
  getRecentMedia: vi.fn(),
  getComments: vi.fn(),
  getAccountInsights: vi.fn(),
  getFollowerCount: vi.fn(),
  getMediaInsights: vi.fn(),
  getOwnUsername: vi.fn(),
}));
vi.mock("@/lib/instagram/igConfig", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getIgUserId: vi.fn(() => "1784100000000000"),
}));

import * as igClient from "@/lib/instagram/igClient";
import { metaGraphInstagramReadProvider } from "@/lib/instagram/providers/metaGraphProvider";
import { createComposioInstagramReadProvider } from "@/lib/instagram/providers/composioProvider";
import { selectInstagramReadProvider } from "@/lib/instagram/providers/select";
import type { ComposioMcpClient } from "@/lib/composio/mcpClient";
import type { InstagramReadProvider } from "@/lib/instagram/providers/types";

function fakeMcpClient(responses: Record<string, unknown>): ComposioMcpClient {
  return {
    callTool: vi.fn(async (slug: string) => {
      if (slug in responses) {
        const r = responses[slug];
        if (r instanceof Error) throw r;
        return r;
      }
      throw new Error(`unexpected tool ${slug}`);
    }),
    listTools: vi.fn(async () => []),
  } as unknown as ComposioMcpClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COMPOSIO_CONSUMER_API_KEY", "test-key-not-real");
  vi.stubEnv("COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID", "ca_test123");
  vi.stubEnv("COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE", "grafikcem");
  vi.stubEnv("INSTAGRAM_DATA_PROVIDER", "auto");
});

afterEach(() => vi.unstubAllEnvs());

describe("provider sözleşmesi — read-only yüzey", () => {
  it("hiçbir provider'da yazma/DM metodu yok", () => {
    const composio = createComposioInstagramReadProvider({ client: fakeMcpClient({}) });
    for (const p of [metaGraphInstagramReadProvider, composio] as InstagramReadProvider[]) {
      const methods = Object.keys(p);
      const forbidden = /publish|create|send|reply|delete|message|conversation|dm|update|mark/i;
      expect(methods.some((m) => forbidden.test(m))).toBe(false);
      expect(methods).toContain("listOwnMedia");
      expect(methods).toContain("healthCheck");
    }
  });
});

describe("ComposioInstagramReadProvider — normalize + explicit account", () => {
  it("medya listesi normalize edilir; connected_account_id her çağrıda açıkça gider", async () => {
    const client = fakeMcpClient({
      INSTAGRAM_GET_IG_USER_MEDIA: {
        data: [
          { id: "m1", caption: "test", media_type: "VIDEO", media_product_type: "REELS", like_count: 5, comments_count: 2, permalink: "https://ig/p1", timestamp: "2026-07-16T10:00:00+0000" },
          { bozuk: true },
        ],
      },
    });
    const provider = createComposioInstagramReadProvider({ client });
    const media = await provider.listOwnMedia({ limit: 10 });
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ mediaId: "m1", mediaProductType: "REELS", likeCount: 5 });
    const call = vi.mocked(client.callTool).mock.calls[0];
    expect((call[1] as Record<string, unknown>).connected_account_id).toBe("ca_test123");
  });

  it("media limit üst sınırı aşılamaz (bounded fetch)", async () => {
    const client = fakeMcpClient({ INSTAGRAM_GET_IG_USER_MEDIA: { data: [] } });
    const provider = createComposioInstagramReadProvider({ client });
    await provider.listOwnMedia({ limit: 500 });
    const args = vi.mocked(client.callTool).mock.calls[0][1] as Record<string, unknown>;
    expect(args.limit).toBeLessThanOrEqual(25);
  });

  it("insight yanıtı Graph şekli (values/total_value) toleranslı parse edilir", async () => {
    const client = fakeMcpClient({
      INSTAGRAM_GET_IG_MEDIA_INSIGHTS: {
        data: [
          { name: "reach", values: [{ value: 1200 }] },
          { name: "saved", total_value: { value: 34 } },
        ],
      },
    });
    const provider = createComposioInstagramReadProvider({ client });
    const ins = await provider.getMediaInsights("m1");
    expect(ins).toMatchObject({ mediaId: "m1", reach: 1200, saves: 34 });
  });

  it("malformed yanıt: media parse edilemezse boş liste (crash yok)", async () => {
    const client = fakeMcpClient({ INSTAGRAM_GET_IG_USER_MEDIA: "not json shape" });
    const provider = createComposioInstagramReadProvider({ client });
    expect(await provider.listOwnMedia()).toEqual([]);
  });

  it("yorumlar normalize; limit bounded", async () => {
    const client = fakeMcpClient({
      INSTAGRAM_GET_IG_MEDIA_COMMENTS: {
        data: [{ id: "c1", text: "harika", username: "fan1", parent_id: undefined }],
      },
    });
    const provider = createComposioInstagramReadProvider({ client });
    const comments = await provider.listMediaComments("m1", { limit: 999 });
    expect(comments[0]).toMatchObject({ commentId: "c1", mediaId: "m1", parentCommentId: null });
    const args = vi.mocked(client.callTool).mock.calls[0][1] as Record<string, unknown>;
    expect(args.limit).toBeLessThanOrEqual(50);
  });
});

describe("MetaGraphInstagramReadProvider — mevcut Meta yolu fallback olarak yaşıyor", () => {
  it("medya normalize edilir", async () => {
    vi.mocked(igClient.getRecentMedia).mockResolvedValue({
      ok: true,
      data: [{ id: "m9", caption: "meta", media_type: "IMAGE", like_count: 7, comments_count: 1 }],
    });
    const media = await metaGraphInstagramReadProvider.listOwnMedia();
    expect(media[0]).toMatchObject({ mediaId: "m9", likeCount: 7 });
  });

  it("token geçersizse health degraded", async () => {
    vi.mocked(igClient.isConfigured).mockResolvedValue(true);
    vi.mocked(igClient.validateToken).mockResolvedValue({ valid: false, error: "meta_190: expired" });
    const h = await metaGraphInstagramReadProvider.healthCheck();
    expect(h).toMatchObject({ healthy: false, connectionState: "degraded" });
  });
});

describe("provider seçimi (INSTAGRAM_DATA_PROVIDER)", () => {
  const healthy = (id: "composio" | "meta"): InstagramReadProvider =>
    ({
      id,
      healthCheck: vi.fn(async () => ({ healthy: true, connectionState: "connected" })),
    }) as unknown as InstagramReadProvider;
  const unhealthy = (id: "composio" | "meta", errorClass: string): InstagramReadProvider =>
    ({
      id,
      healthCheck: vi.fn(async () => ({ healthy: false, connectionState: "degraded", errorClass })),
    }) as unknown as InstagramReadProvider;

  it("auto: Composio healthy → Composio (fallback yok)", async () => {
    const sel = await selectInstagramReadProvider({ composio: healthy("composio"), meta: healthy("meta") });
    expect(sel.providerId).toBe("composio");
    expect(sel.fallbackUsed).toBe(false);
  });

  it("auto: Composio down + Meta healthy → İŞARETLİ fallback", async () => {
    const sel = await selectInstagramReadProvider({
      composio: unhealthy("composio", "unauthorized"),
      meta: healthy("meta"),
    });
    expect(sel.providerId).toBe("meta");
    expect(sel.fallbackUsed).toBe(true);
    expect(sel.fallbackReason).toContain("composio_unauthorized");
  });

  it("explicit composio modu: Meta'ya SESSİZ fallback YOK", async () => {
    vi.stubEnv("INSTAGRAM_DATA_PROVIDER", "composio");
    const meta = healthy("meta");
    const sel = await selectInstagramReadProvider({
      composio: unhealthy("composio", "rate_limited"),
      meta,
    });
    expect(sel.providerId).toBe("none");
    expect(sel.provider).toBeNull();
    expect(meta.healthCheck).not.toHaveBeenCalled();
  });

  it("ikisi de down → none + birleşik dürüst neden", async () => {
    const sel = await selectInstagramReadProvider({
      composio: unhealthy("composio", "not_configured"),
      meta: unhealthy("meta", "token_invalid"),
    });
    expect(sel.providerId).toBe("none");
    expect(sel.fallbackReason).toContain("composio_not_configured");
    expect(sel.fallbackReason).toContain("meta_token_invalid");
  });

  it("explicit meta modu: Composio hiç sorgulanmaz", async () => {
    vi.stubEnv("INSTAGRAM_DATA_PROVIDER", "meta");
    const composio = healthy("composio");
    const sel = await selectInstagramReadProvider({ composio, meta: healthy("meta") });
    expect(sel.providerId).toBe("meta");
    expect(composio.healthCheck).not.toHaveBeenCalled();
  });
});
