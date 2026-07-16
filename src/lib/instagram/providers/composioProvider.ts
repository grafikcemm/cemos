import { z } from "zod";
import { getComposioConfig } from "@/lib/composio/config";
import { ComposioMcpClient, ComposioBridgeError } from "@/lib/composio/mcpClient";
import {
  IgProfileSchema,
  IgMediaItemSchema,
  IgCommentItemSchema,
  IgMediaInsightsSchema,
  IgAccountInsightsSchema,
  InstagramProviderError,
  MEDIA_FETCH_MAX,
  COMMENTS_PER_MEDIA_MAX,
  type InstagramReadProvider,
  type ProviderHealth,
} from "@/lib/instagram/providers/types";

/**
 * Composio MCP tabanlı read-only Instagram provider'ı (ADR-032, birincil yol).
 *
 * - Bağlı hesap SEÇİMİ AÇIKTIR: her tool çağrısına
 *   `connected_account_id` (env: COMPOSIO_INSTAGRAM_CONNECTED_ACCOUNT_ID)
 *   konur — "en son kullanılan hesap" sessiz seçimi YOK.
 * - Tool yanıt şekilleri toleranslı parse edilir (Graph API alan adları
 *   snake_case gelir); normalize Zod tipleri dışına ham yanıt sızmaz.
 * - Slug'lar dokümante toolkit'ten (20260708_00); canlı discovery doğrulaması
 *   mcpClient.callTool içinde fail-closed yapılır.
 */

const RawMediaSchema = z
  .object({
    id: z.string(),
    caption: z.string().optional(),
    media_type: z.string().optional(),
    media_product_type: z.string().optional(),
    permalink: z.string().optional(),
    timestamp: z.string().optional(),
    like_count: z.number().optional(),
    comments_count: z.number().optional(),
  })
  .passthrough();

const RawCommentSchema = z
  .object({
    id: z.string(),
    text: z.string().optional(),
    username: z.string().optional(),
    timestamp: z.string().optional(),
    parent_id: z.string().optional(),
    from: z.object({ username: z.string().optional() }).partial().optional(),
  })
  .passthrough();

/** Graph insights yanıtı: data[].name + values[0].value / total_value.value. */
function readInsightValues(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const data = (raw as { data?: Array<Record<string, unknown>> })?.data;
  if (!Array.isArray(data)) return out;
  for (const entry of data) {
    const name = typeof entry.name === "string" ? entry.name : "";
    if (!name) continue;
    const totalValue = (entry.total_value as { value?: unknown })?.value;
    const firstValue = Array.isArray(entry.values)
      ? ((entry.values[0] as { value?: unknown })?.value as unknown)
      : undefined;
    const v = typeof totalValue === "number" ? totalValue : typeof firstValue === "number" ? firstValue : 0;
    out[name] = v;
  }
  return out;
}

/** Composio yanıt zarfı toleransı: {data:{...}} / {data:[...]} / doğrudan obje. */
function unwrap(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "data" in (raw as Record<string, unknown>)) {
    const inner = (raw as Record<string, unknown>).data;
    // Graph list yanıtı {data:[...]} ise olduğu gibi bırak (list parse'ları data'yı okur).
    if (inner && typeof inner === "object" && !Array.isArray(inner) && !("data" in (inner as Record<string, unknown>))) {
      return inner;
    }
  }
  return raw;
}

function listOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const data = (raw as { data?: unknown })?.data;
  if (Array.isArray(data)) return data;
  const nested = ((raw as { data?: { data?: unknown } })?.data as { data?: unknown })?.data;
  if (Array.isArray(nested)) return nested;
  return [];
}

function wrapError(e: unknown): InstagramProviderError {
  if (e instanceof ComposioBridgeError) {
    return new InstagramProviderError("composio", e.errorClass, e.message);
  }
  return new InstagramProviderError("composio", "unknown", e instanceof Error ? e.message : String(e));
}

export function createComposioInstagramReadProvider(opts?: {
  client?: ComposioMcpClient;
}): InstagramReadProvider {
  const cfg = getComposioConfig();
  const client = opts?.client ?? new ComposioMcpClient();

  function baseArgs(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { connected_account_id: cfg.connectedAccountId, ...extra };
  }

  return {
    id: "composio",

    async healthCheck(): Promise<ProviderHealth> {
      const current = getComposioConfig();
      if (!current.configured) {
        return { healthy: false, connectionState: "unconfigured", errorClass: "not_configured" };
      }
      try {
        // Hafif canlı doğrulama: profil bilgisi tek read çağrısı.
        await client.callTool("INSTAGRAM_GET_USER_INFO", baseArgs());
        return { healthy: true, connectionState: "connected" };
      } catch (e) {
        const err = wrapError(e);
        const blocked = err.errorClass === "unauthorized" || err.errorClass === "not_configured";
        return {
          healthy: false,
          connectionState: blocked ? "blocked" : "degraded",
          errorClass: err.errorClass,
          detail: err.message,
        };
      }
    },

    async getOwnProfile() {
      try {
        const raw = unwrap(await client.callTool("INSTAGRAM_GET_USER_INFO", baseArgs()));
        const o = (raw ?? {}) as Record<string, unknown>;
        return IgProfileSchema.parse({
          igUserId: String(o.id ?? o.ig_id ?? o.user_id ?? ""),
          username: String(o.username ?? ""),
          name: String(o.name ?? o.username ?? ""),
          followersCount: typeof o.followers_count === "number" ? o.followers_count : 0,
          mediaCount: typeof o.media_count === "number" ? o.media_count : 0,
        });
      } catch (e) {
        throw wrapError(e);
      }
    },

    async listOwnMedia(opts2) {
      const limit = Math.min(Math.max(opts2?.limit ?? MEDIA_FETCH_MAX, 1), MEDIA_FETCH_MAX);
      try {
        const raw = await client.callTool(
          "INSTAGRAM_GET_IG_USER_MEDIA",
          baseArgs({
            limit,
            fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
          })
        );
        const items = listOf(raw)
          .map((m) => RawMediaSchema.safeParse(m))
          .filter((r): r is { success: true; data: z.infer<typeof RawMediaSchema> } => r.success)
          .map((r) => r.data);
        return items.slice(0, limit).map((m) =>
          IgMediaItemSchema.parse({
            mediaId: m.id,
            caption: m.caption ?? "",
            mediaType: m.media_type ?? "",
            mediaProductType: m.media_product_type ?? "",
            permalink: m.permalink ?? "",
            timestamp: m.timestamp ?? "",
            likeCount: m.like_count ?? 0,
            commentsCount: m.comments_count ?? 0,
          })
        );
      } catch (e) {
        throw wrapError(e);
      }
    },

    async getMediaInsights(mediaId) {
      try {
        const raw = await client.callTool(
          "INSTAGRAM_GET_IG_MEDIA_INSIGHTS",
          baseArgs({ media_id: mediaId, metric: "reach,views,likes,comments,saved,shares" })
        );
        const values = readInsightValues(raw);
        if (Object.keys(values).length === 0) return null;
        return IgMediaInsightsSchema.parse({
          mediaId,
          reach: values.reach ?? 0,
          views: values.views ?? values.impressions ?? 0,
          likes: values.likes ?? 0,
          comments: values.comments ?? 0,
          saves: values.saved ?? values.saves ?? 0,
          shares: values.shares ?? 0,
        });
      } catch (e) {
        // Kısmi insight izni: tek medya insight'ının düşmesi sync'i öldürmez.
        const err = wrapError(e);
        if (err.errorClass === "tool_error") return null;
        throw err;
      }
    },

    async getAccountInsights() {
      try {
        const raw = await client.callTool(
          "INSTAGRAM_GET_USER_INSIGHTS",
          baseArgs({
            metric: "reach,views,accounts_engaged,total_interactions,likes,comments,saves,shares",
            period: "day",
            metric_type: "total_value",
          })
        );
        const values = readInsightValues(raw);
        if (Object.keys(values).length === 0) return null;
        let followersCount = 0;
        try {
          const profile = await this.getOwnProfile();
          followersCount = profile.followersCount;
        } catch {
          // takipçi sayısı best-effort
        }
        return IgAccountInsightsSchema.parse({
          reach: values.reach ?? 0,
          views: values.views ?? 0,
          accountsEngaged: values.accounts_engaged ?? 0,
          likes: values.likes ?? 0,
          comments: values.comments ?? 0,
          saves: values.saves ?? 0,
          shares: values.shares ?? 0,
          followersCount,
        });
      } catch (e) {
        const err = wrapError(e);
        if (err.errorClass === "tool_error") return null;
        throw err;
      }
    },

    async listMediaComments(mediaId, opts2) {
      const limit = Math.min(Math.max(opts2?.limit ?? COMMENTS_PER_MEDIA_MAX, 1), COMMENTS_PER_MEDIA_MAX);
      try {
        const raw = await client.callTool(
          "INSTAGRAM_GET_IG_MEDIA_COMMENTS",
          baseArgs({ media_id: mediaId, limit })
        );
        const items = listOf(raw)
          .map((c) => RawCommentSchema.safeParse(c))
          .filter((r): r is { success: true; data: z.infer<typeof RawCommentSchema> } => r.success)
          .map((r) => r.data);
        return items.slice(0, limit).map((c) =>
          IgCommentItemSchema.parse({
            commentId: c.id,
            mediaId,
            parentCommentId: c.parent_id ?? null,
            username: c.username ?? c.from?.username ?? "",
            text: c.text ?? "",
            timestamp: c.timestamp ?? "",
          })
        );
      } catch (e) {
        throw wrapError(e);
      }
    },
  };
}
