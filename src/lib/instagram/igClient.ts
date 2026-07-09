/**
 * Instagram Graph API istemcisi (Faz D). Her çağrı FAIL-OPEN: non-200 ya da ağ
 * hatası throw etmez, { ok:false, error } döner — cron asla patlamaz.
 *
 * Token okuma sırası: DB (IntegrationCredential) → env (META_ACCESS_TOKEN).
 * Yazma API'si YOK — yalnız okuma + token tazeleme.
 */

import {
  GRAPH_BASE,
  META_TOKEN_KEY,
  TOKEN_WARN_DAYS,
  TOKEN_CRITICAL_DAYS,
  getIgUserId,
  getMetaAppId,
  getMetaAppSecret,
  getMetaPageId,
} from "@/lib/instagram/igConfig";
import { integrationCredentialRepo } from "@/lib/db/integrationCredentialRepo";

export type IgFetch<T> = { ok: boolean; data?: T; error?: string };

export type RawIgMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
};

export type RawIgComment = {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  parent_id?: string;
};

export type TokenStatus = "ok" | "warn" | "critical" | "unknown";

export type TokenHealth = {
  configured: boolean;
  source: "db" | "env" | "none";
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  status: TokenStatus;
  /** Canlı Meta doğrulaması (best-effort). expiresAt metadata yoksa gerçek geçerliliği gösterir. */
  live?: { valid: boolean; error?: string };
};

const FETCH_TIMEOUT_MS = 15_000;
const LONG_LIVED_FALLBACK_SECONDS = 60 * 86_400; // FB uzun ömürlü token ≈ 60 gün
const ENC = encodeURIComponent;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Fail-open GET — abort'lu, non-200/throw'da { ok:false }. */
/**
 * Hata metinlerinden sır sızıntısını engeller: ağ hatası mesajı isteğin TAM
 * URL'sini içerebilir ve URL query'sinde token/secret vardır. Bunları redakte et.
 */
function redactSecrets(s: string): string {
  return s.replace(/(access_token|client_secret|fb_exchange_token)=[^&\s"']+/gi, "$1=[redacted]");
}

async function safeGet<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<IgFetch<T>> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: redactSecrets(`meta_${res.status}: ${body.slice(0, 200)}`) };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: redactSecrets(errMsg(e)) };
  }
}

/**
 * Token okuma sırası: DB → env. Vercel env runtime'da değişmez; yenilenen token
 * DB'de olur → DB önce okunur (refresh redeploy'suz devreye girer).
 */
export async function getEffectiveToken(): Promise<{
  token: string | null;
  source: "db" | "env" | "none";
}> {
  try {
    const cred = await integrationCredentialRepo.get(META_TOKEN_KEY);
    if (cred?.value && cred.value.trim() !== "") {
      return { token: cred.value.trim(), source: "db" };
    }
  } catch {
    // DB hiccup → env fallback
  }
  const env = process.env.META_ACCESS_TOKEN?.trim();
  if (env) return { token: env, source: "env" };
  return { token: null, source: "none" };
}

/**
 * Page Access Token — DM/conversations endpoint'leri Page token ister (IG-user
 * token #190 verir). User token'dan türetilir: GET /{page-id}?fields=access_token.
 * Modül-içi cache (process ömrü). Token/scope yoksa null.
 */
let cachedPageToken: string | null = null;
export async function getPageAccessToken(): Promise<string | null> {
  // Only positive results are cached — a null (missing token/env/scope) is never
  // memoized, so a later token refresh or env repair self-heals within the process.
  if (cachedPageToken) return cachedPageToken;
  const { token } = await getEffectiveToken();
  const pageId = getMetaPageId();
  if (!token || !pageId) return null;
  const url = `${GRAPH_BASE}/${pageId}?fields=access_token&access_token=${ENC(token)}`;
  const r = await safeGet<{ access_token?: string }>(url);
  if (r.ok && r.data?.access_token) cachedPageToken = r.data.access_token;
  return cachedPageToken;
}

/**
 * Hesabın kendi IG kullanıcı adı — kendi yanıtlarımızı yorum akışından gizlemek
 * için. GET /{ig-user-id}?fields=username. Modül-içi cache.
 */
let cachedOwnUsername: string | null = null;
export async function getOwnUsername(): Promise<string | null> {
  // Positive-only cache (see getPageAccessToken) — null never sticks across calls.
  if (cachedOwnUsername) return cachedOwnUsername;
  const { token } = await getEffectiveToken();
  const igUserId = getIgUserId();
  if (!token || !igUserId) return null;
  const url = `${GRAPH_BASE}/${igUserId}?fields=username&access_token=${ENC(token)}`;
  const r = await safeGet<{ username?: string }>(url);
  if (r.ok && r.data?.username) cachedOwnUsername = r.data.username;
  return cachedOwnUsername;
}

/** App id/secret + IG user id + çözülebilir token varsa yapılandırılmış. */
export async function isConfigured(): Promise<boolean> {
  if (!getIgUserId() || !getMetaAppId() || !getMetaAppSecret()) return false;
  const { token } = await getEffectiveToken();
  return token !== null;
}

/** GET /{ig-user-id}/media — son gönderiler. */
export async function getRecentMedia(limit = 25): Promise<IgFetch<RawIgMedia[]>> {
  const { token } = await getEffectiveToken();
  const igUserId = getIgUserId();
  if (!token || !igUserId) return { ok: false, error: "not_configured" };
  const fields = "id,caption,media_type,permalink,timestamp,like_count,comments_count";
  const url = `${GRAPH_BASE}/${igUserId}/media?fields=${ENC(fields)}&limit=${limit}&access_token=${ENC(token)}`;
  const r = await safeGet<{ data?: RawIgMedia[] }>(url);
  return r.ok ? { ok: true, data: r.data?.data ?? [] } : { ok: false, error: r.error };
}

/**
 * GET /{ig-media-id}/comments — üst yorumlar + yanıtlar düzleştirilir.
 * Yanıtlar parent_id taşır; üst yorumun parent_id'si null kabul edilir.
 */
export async function getComments(mediaId: string): Promise<IgFetch<RawIgComment[]>> {
  const { token } = await getEffectiveToken();
  if (!token) return { ok: false, error: "not_configured" };
  const fields =
    "id,text,username,timestamp,parent_id,replies{id,text,username,timestamp,parent_id}";
  const url = `${GRAPH_BASE}/${mediaId}/comments?fields=${ENC(fields)}&limit=50&access_token=${ENC(token)}`;
  const r = await safeGet<{
    data?: Array<RawIgComment & { replies?: { data?: RawIgComment[] } }>;
  }>(url);
  if (!r.ok) return { ok: false, error: r.error };
  const flat: RawIgComment[] = [];
  for (const c of r.data?.data ?? []) {
    flat.push({
      id: c.id,
      text: c.text,
      username: c.username,
      timestamp: c.timestamp,
      parent_id: c.parent_id,
    });
    for (const reply of c.replies?.data ?? []) {
      flat.push({
        id: reply.id,
        text: reply.text,
        username: reply.username,
        timestamp: reply.timestamp,
        parent_id: reply.parent_id ?? c.id,
      });
    }
  }
  return { ok: true, data: flat };
}

/**
 * Uzun ömürlü token'ı tazeler (60 günlük pencereyi yeniler). Yalnız HÂLÂ geçerli
 * bir token üzerinde çalışır (Meta kuralı — tamamen dolmuş token yeni login ister).
 * Başarıda yeni token + expiresAt DB'ye yazılır.
 */
export async function refreshLongLivedToken(): Promise<
  IgFetch<{ expiresAt: string; daysUntilExpiry: number }>
> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  const { token } = await getEffectiveToken();
  if (!appId || !appSecret || !token) return { ok: false, error: "not_configured" };
  const url =
    `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${ENC(appId)}&client_secret=${ENC(appSecret)}&fb_exchange_token=${ENC(token)}`;
  const r = await safeGet<{ access_token?: string; expires_in?: number }>(url);
  if (!r.ok || !r.data?.access_token) {
    return { ok: false, error: r.error ?? "no_token_in_response" };
  }
  const expiresInSec =
    typeof r.data.expires_in === "number" && r.data.expires_in > 0
      ? r.data.expires_in
      : LONG_LIVED_FALLBACK_SECONDS;
  const expiresAt = new Date(Date.now() + expiresInSec * 1000);
  try {
    await integrationCredentialRepo.upsert(META_TOKEN_KEY, r.data.access_token, {
      expiresAt,
      meta: { refreshedAt: new Date().toISOString() },
    });
  } catch (e) {
    // İç hata (Prisma) DATABASE_URL içerebilir → yalnız sunucuda logla, statik kod döndür.
    console.error("Meta token DB'ye yazılamadı:", errMsg(e));
    return { ok: false, error: "token_persist_failed" };
  }
  const days = computeTokenStatus(expiresAt).daysUntilExpiry ?? 0;
  return { ok: true, data: { expiresAt: expiresAt.toISOString(), daysUntilExpiry: days } };
}

/** SAF: expiresAt + now → gün sayısı + eşik durumu. Birim test edilebilir. */
export function computeTokenStatus(
  expiresAt: Date | null,
  nowMs: number = Date.now()
): { daysUntilExpiry: number | null; status: TokenStatus } {
  if (!expiresAt) return { daysUntilExpiry: null, status: "unknown" };
  const days = Math.floor((expiresAt.getTime() - nowMs) / 86_400_000);
  const status: TokenStatus =
    days <= TOKEN_CRITICAL_DAYS ? "critical" : days <= TOKEN_WARN_DAYS ? "warn" : "ok";
  return { daysUntilExpiry: days, status };
}

/** Token sağlığı — sekme banner'ı + healthService alarmı. */
/**
 * Canlı token doğrulama — GET /{ig-user-id}?fields=id ile token'ın gerçekten
 * çalışıp çalışmadığını test eder (best-effort). expiresAt metadata olmadığında
 * "unknown" yerine gerçek geçerliliği bildirmek için kullanılır.
 */
export async function validateToken(): Promise<{ valid: boolean; error?: string }> {
  const { token } = await getEffectiveToken();
  const igUserId = getIgUserId();
  if (!token || !igUserId) return { valid: false, error: "not_configured" };
  const url = `${GRAPH_BASE}/${igUserId}?fields=id&access_token=${ENC(token)}`;
  const r = await safeGet<{ id?: string }>(url);
  return r.ok ? { valid: true } : { valid: false, error: r.error };
}

export async function getTokenHealth(): Promise<TokenHealth> {
  const { token, source } = await getEffectiveToken();
  const configured = token !== null && Boolean(getIgUserId());
  let expiresAt: Date | null = null;
  try {
    const cred = await integrationCredentialRepo.get(META_TOKEN_KEY);
    expiresAt = cred?.expiresAt ?? null;
  } catch {
    expiresAt = null;
  }
  const { daysUntilExpiry, status } = computeTokenStatus(expiresAt);
  // Canlı doğrulama yalnızca yapılandırılmışsa (boşuna Meta çağrısı yapma).
  const live = configured ? await validateToken() : undefined;
  return {
    configured,
    source,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    daysUntilExpiry,
    status,
    live,
  };
}

// ── Faz E: DM (Messenger Platform) + İstatistik (Insights) ──────────────────────
//
// DM konuşmaları FB Page üzerinden okunur: GET /{page-id}/conversations?platform=instagram
// (ig-user-id DEĞİL). Page IG hesabına bağlı değilse / pages_show_list yoksa Meta hata
// döner → safeGet fail-open → boş sync. Yazma YOK (manuel kopya).

export type RawIgConversation = {
  id: string;
  updated_time?: string;
  participants?: { data?: Array<{ id?: string; username?: string; name?: string }> };
};

export type RawIgDmMessage = {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; username?: string; name?: string };
};

/** GET /{page-id}/conversations?platform=instagram — IG DM thread listesi. */
export async function getConversations(
  limit = 20
): Promise<IgFetch<RawIgConversation[]>> {
  const pageId = getMetaPageId();
  const pageToken = await getPageAccessToken();
  if (!pageId) return { ok: false, error: "not_configured" };
  if (!pageToken)
    return { ok: false, error: "page_token_unavailable — token'da pages_show_list/pages_messaging izni gerekli" };
  // KRİTİK: bu hesapta Meta limit>=2'de sunucu-tarafı timeout (#-2/2534084) veriyor;
  // SADECE limit=1 hızlı (≈4.5s) çalışıyor. Çözüm: limit=1 + paging.next ile sayfala.
  // participants expansion YOK (ağır); participantUsername mesaj from'undan doldurulur.
  const cap = Math.min(Math.max(limit, 1), 12);
  const budgetUntil = Date.now() + 55_000;
  const out: RawIgConversation[] = [];
  let next: string | null =
    `${GRAPH_BASE}/${pageId}/conversations?platform=instagram&fields=${ENC("id,updated_time")}` +
    `&limit=1&access_token=${ENC(pageToken)}`;
  let firstError: string | undefined;
  for (let i = 0; i < cap && next && Date.now() < budgetUntil; i++) {
    const r: IgFetch<{ data?: RawIgConversation[]; paging?: { next?: string } }> = await safeGet(
      next,
      20_000
    );
    if (!r.ok) {
      if (i === 0) firstError = r.error;
      break;
    }
    out.push(...(r.data?.data ?? []));
    next = r.data?.paging?.next ?? null;
  }
  if (out.length === 0 && firstError) return { ok: false, error: firstError };
  return { ok: true, data: out };
}

/** GET /{conversation-id}?fields=messages — mesajlar (yeni → eski; servis sıralar). */
export async function getConversationMessages(
  conversationId: string,
  limit = 20
): Promise<IgFetch<RawIgDmMessage[]>> {
  // Conversation Page altında → Page token gerekir (IG-user token #190 verir).
  const pageToken = await getPageAccessToken();
  if (!pageToken) return { ok: false, error: "page_token_unavailable" };
  const sub = `messages.limit(${limit}){id,message,created_time,from}`;
  const url =
    `${GRAPH_BASE}/${conversationId}?fields=${ENC(sub)}&access_token=${ENC(pageToken)}`;
  const r = await safeGet<{ messages?: { data?: RawIgDmMessage[] } }>(url);
  return r.ok ? { ok: true, data: r.data?.messages?.data ?? [] } : { ok: false, error: r.error };
}

/**
 * GET /{ig-user-id}/insights — hesap günlük metrikleri. Metrik adları Meta sürümleri
 * arası kayar (impressions→views); HAM döndürülür, tolerant parse insight-pipeline'da.
 */
export async function getAccountInsights(): Promise<IgFetch<unknown>> {
  const { token } = await getEffectiveToken();
  const igUserId = getIgUserId();
  if (!token || !igUserId) return { ok: false, error: "not_configured" };
  const metric =
    "reach,views,accounts_engaged,total_interactions,likes,comments,saves,shares";
  const url =
    `${GRAPH_BASE}/${igUserId}/insights?metric=${ENC(metric)}&metric_type=total_value` +
    `&period=day&access_token=${ENC(token)}`;
  const r = await safeGet<unknown>(url);
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
}

// ── Sprint 4: business_discovery (rakip watchlist — TEK onaylı otomatik okuma) ──

export type BusinessDiscoveryMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
};

export type BusinessDiscoveryResult = {
  username: string;
  name?: string;
  followers_count?: number;
  media_count?: number;
  media: BusinessDiscoveryMedia[];
};

/**
 * GET /{ig-user-id}?fields=business_discovery.username(HANDLE){...} — public
 * professional hesabın son medyası. Personal/private/age-gated hesaplar Meta
 * hatası döner → fail-open { ok:false } (çağıran Türkçe "manuel ekle" işler).
 */
export async function getBusinessDiscovery(
  username: string,
  mediaLimit = 25
): Promise<IgFetch<BusinessDiscoveryResult>> {
  const { token } = await getEffectiveToken();
  const igUserId = getIgUserId();
  if (!token || !igUserId) return { ok: false, error: "not_configured" };
  const clean = username.replace(/^@/, "").trim();
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(clean)) return { ok: false, error: "invalid_username" };
  const fields =
    `business_discovery.username(${clean})` +
    `{username,name,followers_count,media_count,` +
    `media.limit(${mediaLimit}){id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}}`;
  const url = `${GRAPH_BASE}/${igUserId}?fields=${ENC(fields)}&access_token=${ENC(token)}`;
  const r = await safeGet<{
    business_discovery?: Omit<BusinessDiscoveryResult, "media"> & {
      media?: { data?: BusinessDiscoveryMedia[] };
    };
  }>(url);
  if (!r.ok) return { ok: false, error: r.error };
  const bd = r.data?.business_discovery;
  if (!bd?.username) return { ok: false, error: "business_discovery_empty" };
  return {
    ok: true,
    data: {
      username: bd.username,
      name: bd.name,
      followers_count: bd.followers_count,
      media_count: bd.media_count,
      media: bd.media?.data ?? [],
    },
  };
}

/** GET /{ig-user-id}?fields=followers_count — anlık takipçi. */
export async function getFollowerCount(): Promise<IgFetch<number>> {
  const { token } = await getEffectiveToken();
  const igUserId = getIgUserId();
  if (!token || !igUserId) return { ok: false, error: "not_configured" };
  const url = `${GRAPH_BASE}/${igUserId}?fields=followers_count&access_token=${ENC(token)}`;
  const r = await safeGet<{ followers_count?: number }>(url);
  if (!r.ok) return { ok: false, error: r.error };
  const n = r.data?.followers_count;
  return { ok: true, data: typeof n === "number" ? n : 0 };
}

/**
 * GET /{ig-user-id}/media?fields=...,insights — medya başına performans (seri analizi
 * + top medya). HAM döndürülür; tolerant parse insight-pipeline'da.
 */
export async function getMediaInsights(limit = 12): Promise<IgFetch<unknown>> {
  const { token } = await getEffectiveToken();
  const igUserId = getIgUserId();
  if (!token || !igUserId) return { ok: false, error: "not_configured" };
  const fields =
    "id,caption,permalink,media_type,timestamp,like_count,comments_count," +
    "insights.metric(reach,saved,shares,likes,comments)";
  const url =
    `${GRAPH_BASE}/${igUserId}/media?fields=${ENC(fields)}&limit=${limit}` +
    `&access_token=${ENC(token)}`;
  const r = await safeGet<unknown>(url);
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
}
