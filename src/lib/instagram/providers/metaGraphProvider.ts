import {
  isConfigured,
  getRecentMedia,
  getComments,
  getAccountInsights as igGetAccountInsights,
  getFollowerCount,
  getMediaInsights as igGetMediaInsights,
  getOwnUsername,
  validateToken,
} from "@/lib/instagram/igClient";
import { getIgUserId } from "@/lib/instagram/igConfig";
import { parseAccountInsights, parseMediaInsights } from "@/lib/instagram/insight-pipeline";
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
 * Mevcut direct Meta Graph istemcisinin (igClient — SİLİNMEDİ) normalize
 * provider sarmalayıcısı (ADR-032 fallback yolu). igClient fail-open
 * {ok,error} döner; provider bunu typed hataya/normalize tipe çevirir.
 */
export const metaGraphInstagramReadProvider: InstagramReadProvider = {
  id: "meta",

  async healthCheck(): Promise<ProviderHealth> {
    if (!(await isConfigured())) {
      return { healthy: false, connectionState: "unconfigured", errorClass: "not_configured" };
    }
    const live = await validateToken();
    return live.valid
      ? { healthy: true, connectionState: "connected" }
      : {
          healthy: false,
          connectionState: "degraded",
          errorClass: "token_invalid",
          detail: live.error,
        };
  },

  async getOwnProfile() {
    const username = (await getOwnUsername()) ?? "";
    const follower = await getFollowerCount();
    return IgProfileSchema.parse({
      igUserId: getIgUserId() ?? "",
      username,
      name: username,
      followersCount: follower.ok ? follower.data : 0,
      mediaCount: 0, // direct Meta yolu media_count alanını çekmiyor (dürüst 0)
    });
  },

  async listOwnMedia(opts) {
    const limit = Math.min(Math.max(opts?.limit ?? MEDIA_FETCH_MAX, 1), MEDIA_FETCH_MAX);
    const r = await getRecentMedia(limit);
    if (!r.ok) throw new InstagramProviderError("meta", "fetch_failed", r.error ?? "media alınamadı");
    return (r.data ?? []).map((m) =>
      IgMediaItemSchema.parse({
        mediaId: m.id,
        caption: m.caption ?? "",
        mediaType: m.media_type ?? "",
        mediaProductType: "",
        permalink: m.permalink ?? "",
        timestamp: m.timestamp ?? "",
        likeCount: typeof m.like_count === "number" ? m.like_count : 0,
        commentsCount: typeof m.comments_count === "number" ? m.comments_count : 0,
      })
    );
  },

  async getMediaInsights(mediaId) {
    // Direct Meta yolu medya insight'larını toplu endpoint'ten okur; tek medya
    // için toplu sonuçtan süzülür (ekstra izin gerektiren tekil çağrı yok).
    const r = await igGetMediaInsights(MEDIA_FETCH_MAX);
    if (!r.ok) return null;
    const items = parseMediaInsights(r.data);
    const hit = items.find((i) => i.mediaId === mediaId);
    if (!hit) return null;
    return IgMediaInsightsSchema.parse({
      mediaId,
      reach: hit.reach ?? 0,
      views: 0,
      likes: hit.likes ?? 0,
      comments: hit.comments ?? 0,
      saves: hit.saves ?? 0,
      shares: hit.shares ?? 0,
    });
  },

  async getAccountInsights() {
    const r = await igGetAccountInsights();
    if (!r.ok) return null;
    const parsed = parseAccountInsights(r.data);
    const follower = await getFollowerCount();
    return IgAccountInsightsSchema.parse({
      reach: parsed?.reach ?? 0,
      views: parsed?.views ?? 0,
      accountsEngaged: parsed?.accountsEngaged ?? 0,
      likes: parsed?.likes ?? 0,
      comments: parsed?.comments ?? 0,
      saves: parsed?.saves ?? 0,
      shares: parsed?.shares ?? 0,
      followersCount: follower.ok ? follower.data : 0,
    });
  },

  async listMediaComments(mediaId, opts) {
    const limit = Math.min(Math.max(opts?.limit ?? COMMENTS_PER_MEDIA_MAX, 1), COMMENTS_PER_MEDIA_MAX);
    const r = await getComments(mediaId);
    if (!r.ok) throw new InstagramProviderError("meta", "fetch_failed", r.error ?? "yorumlar alınamadı");
    return (r.data ?? []).slice(0, limit).map((c) =>
      IgCommentItemSchema.parse({
        commentId: c.id,
        mediaId,
        parentCommentId: c.parent_id ?? null,
        username: c.username ?? "",
        text: c.text ?? "",
        timestamp: c.timestamp ?? "",
      })
    );
  },
};
