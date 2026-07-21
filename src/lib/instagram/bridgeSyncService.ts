import { prisma } from "@/lib/db/client";
import { igMediaRepo } from "@/lib/db/igMediaRepo";
import { igCommentRepo } from "@/lib/db/igCommentRepo";
import { igInsightSnapshotRepo } from "@/lib/db/igInsightSnapshotRepo";
import { istanbulDateKey } from "@/lib/instagram/igConfig";
import { getComposioConfig, missingComposioEnvNames } from "@/lib/composio/config";
import { selectInstagramReadProvider, type ProviderSelection } from "@/lib/instagram/providers/select";
import { isKnownAccountHandleDb } from "@/lib/accounts/profileRepository";
import type { IgMediaItem } from "@/lib/instagram/providers/types";
import { redactError } from "@/lib/utils/redactSecrets";

/**
 * Composio/Meta provider-soyutlamalı OWN-ACCOUNT Instagram sync'i (ADR-032).
 *
 * READ-ONLY: yayınlama/yorum yazma/DM YOK (provider sözleşmesinde metodu bile
 * yok). Idempotent: media/comment upsert'leri external Instagram ID anahtarlı;
 * insight snapshot'ı `date @unique` (günde 1). Fail-open iç aşamalar; ancak
 * hesap BINDING'i fail-closed: `COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE` DB'de
 * doğrulanamazsa sync HİÇ başlamaz (yanlış hesaba yazım imkânsız).
 *
 * Rakip verisi BİLİNÇLİ kapsam dışı: Composio toolkit'inde business_discovery
 * yok — mevcut Meta business_discovery yolu (igCompetitorService) aynen kalır.
 */

const MEDIA_LIMIT_DEFAULT = 25;
const COMMENTS_PER_MEDIA = 50;
const MEDIA_INSIGHT_SAMPLE = 8;

export type BridgeSyncResult = {
  ok: boolean;
  provider: "composio" | "meta" | "none";
  mode: "composio" | "meta" | "auto";
  fallbackUsed: boolean;
  fallbackReason?: string;
  connectionState: string;
  accountHandle: string;
  boundAccountId: string | null;
  externalUsername: string;
  mediaFetched: number;
  mediaUpserted: number;
  commentsFetched: number;
  commentsUpserted: number;
  insightCaptured: boolean;
  contentBridged: number;
  toolkitVersion: string;
  warnings: string[];
  errorClass?: string;
  error?: string;
};

function emptyResult(partial: Partial<BridgeSyncResult>): BridgeSyncResult {
  return {
    ok: false,
    provider: "none",
    mode: "auto",
    fallbackUsed: false,
    connectionState: "unconfigured",
    accountHandle: "",
    boundAccountId: null,
    externalUsername: "",
    mediaFetched: 0,
    mediaUpserted: 0,
    commentsFetched: 0,
    commentsUpserted: 0,
    insightCaptured: false,
    contentBridged: 0,
    toolkitVersion: "",
    warnings: [],
    ...partial,
  };
}

function parseTs(ts?: string): Date | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

async function upsertBinding(input: {
  accountId: string;
  provider: string;
  connectionStatus: string;
  externalAccountId?: string;
  externalHandle?: string;
  toolkitVersion?: string;
  lastErrorClass?: string;
  summary?: unknown;
  success?: boolean;
}): Promise<void> {
  const now = new Date();
  const data = {
    connectionStatus: input.connectionStatus,
    externalAccountId: input.externalAccountId ?? "",
    externalHandle: input.externalHandle ?? "",
    toolkitVersion: input.toolkitVersion ?? "",
    lastErrorClass: input.lastErrorClass ?? "",
    lastVerifiedAt: now,
    ...(input.success ? { lastSuccessfulSyncAt: now } : {}),
    ...(input.summary !== undefined ? { lastSyncSummaryJson: JSON.stringify(input.summary) } : {}),
  };
  await prisma.accountPlatformBinding.upsert({
    where: {
      accountId_platform_provider: {
        accountId: input.accountId,
        platform: "instagram",
        provider: input.provider,
      },
    },
    create: { accountId: input.accountId, platform: "instagram", provider: input.provider, ...data },
    update: data,
  });
}

/** Upsert edilen medyayı kanonik ContentItem havuzuna köprüler (idempotent). */
async function bridgeToContentItems(mediaIds: string[], warnings: string[]): Promise<number> {
  if (mediaIds.length === 0) return 0;
  let bridged = 0;
  try {
    const { fromIgMedia } = await import("@/lib/content/normalizer");
    const { ingestContent } = await import("@/lib/content/ingestService");
    for (const mediaId of mediaIds) {
      try {
        const row = await igMediaRepo.getByMediaId(mediaId);
        if (!row) continue;
        await ingestContent(fromIgMedia(row));
        bridged++;
      } catch (e) {
        warnings.push(`content_bridge:${mediaId}: ${redactError(e)}`);
      }
    }
  } catch (e) {
    warnings.push(`content_bridge_module: ${redactError(e)}`);
  }
  return bridged;
}

export type BridgeSyncOptions = {
  mediaLimit?: number;
  /** true → insight snapshot bugüne yazılmışsa bile diğer aşamalar koşar. */
  skipInsights?: boolean;
};

export async function syncInstagramViaBridge(opts?: BridgeSyncOptions): Promise<BridgeSyncResult> {
  const cfg = getComposioConfig();
  const warnings: string[] = [];

  // ── 1) Hesap binding — FAIL-CLOSED ─────────────────────────────────────────
  const handle = cfg.accountHandle;
  if (!handle) {
    return emptyResult({
      mode: cfg.provider,
      connectionState: "unconfigured",
      errorClass: "binding_missing",
      error: `Instagram sync için hesap binding'i yok. Eksik env: ${missingComposioEnvNames().join(", ") || "COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE"}`,
    });
  }
  let handleKnown = false;
  try {
    handleKnown = await isKnownAccountHandleDb(handle);
  } catch (e) {
    return emptyResult({
      mode: cfg.provider,
      accountHandle: handle,
      connectionState: "degraded",
      errorClass: "binding_unverifiable",
      error: `Hesap binding'i doğrulanamadı (DB erişilemiyor): ${redactError(e)}`,
    });
  }
  if (!handleKnown) {
    return emptyResult({
      mode: cfg.provider,
      accountHandle: handle,
      connectionState: "blocked",
      errorClass: "binding_invalid",
      error: `COMPOSIO_INSTAGRAM_ACCOUNT_HANDLE='${handle}' DB'de aktif bir CemOS hesabına çözülemedi — sync fail-closed durdu.`,
    });
  }
  const account = await prisma.account.findUnique({ where: { handle }, select: { id: true } });
  if (!account) {
    return emptyResult({
      mode: cfg.provider,
      accountHandle: handle,
      connectionState: "blocked",
      errorClass: "binding_invalid",
      error: `Account satırı bulunamadı: ${handle}`,
    });
  }

  // ── 2) Provider seçimi (auto → Composio öncelikli, işaretli fallback) ─────
  let selection: ProviderSelection;
  try {
    selection = await selectInstagramReadProvider();
  } catch (e) {
    return emptyResult({
      mode: cfg.provider,
      accountHandle: handle,
      boundAccountId: account.id,
      connectionState: "degraded",
      errorClass: "provider_selection_failed",
      error: redactError(e),
    });
  }

  const base = emptyResult({
    mode: selection.mode,
    provider: selection.providerId,
    fallbackUsed: selection.fallbackUsed,
    fallbackReason: selection.fallbackReason,
    accountHandle: handle,
    boundAccountId: account.id,
    toolkitVersion: cfg.toolkitVersion,
    connectionState:
      selection.providerId === "composio"
        ? selection.composioHealth?.connectionState ?? "connected"
        : selection.providerId === "meta"
          ? selection.metaHealth?.connectionState ?? "connected"
          : selection.composioHealth?.connectionState ?? "unconfigured",
  });

  if (!selection.provider) {
    const errorClass =
      selection.composioHealth?.errorClass ?? selection.metaHealth?.errorClass ?? "no_provider";
    if (selection.providerId === "none" && cfg.hasApiKey) {
      await upsertBinding({
        accountId: account.id,
        provider: "composio",
        connectionStatus: selection.composioHealth?.connectionState ?? "degraded",
        toolkitVersion: cfg.toolkitVersion,
        lastErrorClass: errorClass,
        success: false,
      }).catch(() => {});
    }
    return {
      ...base,
      ok: false,
      errorClass,
      error:
        cfg.provider === "composio"
          ? "Composio provider sağlıksız ve açık composio modunda Meta'ya sessiz fallback yapılmaz."
          : "Hiçbir Instagram read provider'ı kullanılamıyor (Composio + Meta ikisi de sağlıksız/yapılandırmasız).",
    };
  }

  const provider = selection.provider;

  // ── 3) Profil (username doğrulaması — yanlış bağlı hesabı yüzeye çıkarır) ──
  let externalUsername = "";
  let externalId = "";
  try {
    const profile = await provider.getOwnProfile();
    externalUsername = profile.username;
    externalId = profile.igUserId;
  } catch (e) {
    warnings.push(`profile: ${redactError(e)}`);
  }

  // ── 4) Medya (bounded) + yorumlar (bounded) — idempotent upsert ───────────
  const mediaLimit = Math.min(Math.max(opts?.mediaLimit ?? MEDIA_LIMIT_DEFAULT, 1), MEDIA_LIMIT_DEFAULT);
  let media: IgMediaItem[] = [];
  let mediaUpserted = 0;
  let commentsFetched = 0;
  let commentsUpserted = 0;
  let mediaError: string | undefined;
  let mediaErrorClass: string | undefined;
  try {
    media = await provider.listOwnMedia({ limit: mediaLimit });
  } catch (e) {
    mediaError = redactError(e);
    mediaErrorClass =
      (e as { errorClass?: string }).errorClass ?? "fetch_failed";
  }

  const upsertedMediaIds: string[] = [];
  for (const m of media) {
    try {
      await igMediaRepo.upsertByMediaId({
        mediaId: m.mediaId,
        caption: m.caption,
        mediaType: m.mediaType || m.mediaProductType,
        permalink: m.permalink,
        postedAt: parseTs(m.timestamp),
        likeCount: m.likeCount,
        commentCount: m.commentsCount,
        lastSyncedAt: new Date(),
      });
      mediaUpserted++;
      upsertedMediaIds.push(m.mediaId);
    } catch (e) {
      warnings.push(`media:${m.mediaId}: ${redactError(e)}`);
    }
    try {
      const comments = await provider.listMediaComments(m.mediaId, { limit: COMMENTS_PER_MEDIA });
      commentsFetched += comments.length;
      for (const c of comments) {
        try {
          await igCommentRepo.upsertByCommentId({
            commentId: c.commentId,
            mediaId: m.mediaId,
            parentCommentId: c.parentCommentId,
            username: c.username,
            text: c.text,
            postedAt: parseTs(c.timestamp),
          });
          commentsUpserted++;
        } catch (e) {
          warnings.push(`comment:${c.commentId}: ${redactError(e)}`);
        }
      }
    } catch (e) {
      warnings.push(`comments:${m.mediaId}: ${redactError(e)}`);
    }
  }

  // ── 5) Günlük insight snapshot (idempotent by date) ───────────────────────
  let insightCaptured = false;
  if (!opts?.skipInsights) {
    try {
      const key = istanbulDateKey();
      const existing = await igInsightSnapshotRepo.getByDate(key);
      if (!existing) {
        const account2 = await provider.getAccountInsights();
        const sample = media.slice(0, MEDIA_INSIGHT_SAMPLE);
        const topMedia: Array<Record<string, unknown>> = [];
        for (const m of sample) {
          const ins = await provider.getMediaInsights(m.mediaId).catch(() => null);
          topMedia.push({
            mediaId: m.mediaId,
            caption: m.caption,
            permalink: m.permalink,
            reach: ins?.reach ?? 0,
            likes: ins?.likes ?? m.likeCount,
            comments: ins?.comments ?? m.commentsCount,
            saves: ins?.saves ?? 0,
            shares: ins?.shares ?? 0,
          });
        }
        topMedia.sort((a, b) => Number(b.reach ?? 0) - Number(a.reach ?? 0));
        // insightCaptured HESAP-SEVİYESİ insight yakalamayı ifade eder. account2
        // (getAccountInsights) başarısızsa yalnız media listesi var diye all-zero
        // bir account snapshot'ı YAZMA + insightCaptured=true DEME (sahte-success).
        // Snapshot yalnız account2 başarılıysa oluşur → aynı gün içinde başarılı bir
        // retry gerçek insight'ı yakalayabilir (zero-row idempotency kilidi olmaz).
        if (account2) {
          await igInsightSnapshotRepo.upsertByDate(key, {
            followerCount: account2?.followersCount ?? 0,
            reach: account2?.reach ?? 0,
            views: account2?.views ?? 0,
            accountsEngaged: account2?.accountsEngaged ?? 0,
            likes: account2?.likes ?? 0,
            comments: account2?.comments ?? 0,
            saves: account2?.saves ?? 0,
            shares: account2?.shares ?? 0,
            topMediaJson: JSON.stringify(topMedia),
            seriesJson: "[]",
            // Ham provider yanıtı SAKLANMAZ (token/aşırı veri riski) — yalnız
            // provider + sürüm etiketi (drift teşhisi için yeterli).
            rawJson: JSON.stringify({ provider: selection.providerId, toolkitVersion: cfg.toolkitVersion }),
          });
          insightCaptured = true;
        }
      }
    } catch (e) {
      warnings.push(`insights: ${redactError(e)}`);
    }
  }

  // ── 6) Kanonik içerik köprüsü (mevcut normalizer/ingest yolu) ─────────────
  const contentBridged = await bridgeToContentItems(upsertedMediaIds, warnings);

  const ok = !mediaError && (mediaUpserted > 0 || media.length === 0);
  const result: BridgeSyncResult = {
    ...base,
    ok,
    externalUsername,
    mediaFetched: media.length,
    mediaUpserted,
    commentsFetched,
    commentsUpserted,
    insightCaptured,
    contentBridged,
    warnings,
    ...(mediaError ? { error: mediaError, errorClass: mediaErrorClass } : {}),
  };

  // ── 7) Binding durumunu persist et (secret YOK; yalnız kimlik + sayaçlar) ──
  await upsertBinding({
    accountId: account.id,
    provider: selection.providerId === "none" ? "composio" : selection.providerId,
    connectionStatus: ok ? "connected" : result.connectionState === "connected" ? "degraded" : result.connectionState,
    externalAccountId: selection.providerId === "composio" ? cfg.connectedAccountId : externalId,
    externalHandle: externalUsername,
    toolkitVersion: cfg.toolkitVersion,
    lastErrorClass: result.errorClass ?? "",
    summary: {
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason ?? null,
      mediaFetched: result.mediaFetched,
      mediaUpserted: result.mediaUpserted,
      commentsUpserted: result.commentsUpserted,
      insightCaptured: result.insightCaptured,
      contentBridged: result.contentBridged,
      warnings: warnings.slice(0, 10),
      at: new Date().toISOString(),
    },
    success: ok,
  }).catch((e) => {
    warnings.push(`binding_persist: ${redactError(e)}`);
  });

  return result;
}
