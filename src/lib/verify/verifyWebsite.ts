/**
 * verifyWebsite() — Tier 1 HTTP (Sprint 4, FINAL-CONTENT-ENGINE-SPEC §4.1;
 * Faz 3D sertleştirmesi ADR-038).
 *
 * Deterministik, LLM'siz, otoriter doğrulayıcı: Reels dossier'inin "araç
 * gerçekten açılıyor mu?" kanıt kaynağı. LLM çıktısı HTTP doğrulamanın yerine
 * ASLA geçmez (Bard→Gemini redirect PoC'u bu modülün varlık sebebi).
 *
 *  - Redirect'ler OTOMATİK TAKİP EDİLMEZ: her `Location` hop'u SSRF
 *    guard'ından yeniden geçer, hop ≤ MAX_HOPS.
 *  - robots.txt okunur/uyulur (Disallow eşleşirse doğrulama yapılmaz);
 *    okuma BOUNDED (ROBOTS_MAX_BYTES) — dev robots dosyası belleği şişiremez.
 *  - Render-tier sinyalleri (signup/freeTier/…) bu tier'da 'unknown' (Tier-2
 *    ayrı go/no-go; 451 dışında Türkiye erişimi İDDİA EDİLMEZ).
 *  - Kanıt Zod `VerificationEvidence` olarak doğrulanır; `persist:true` ile
 *    `WebsiteVerification` satırına yazılır (expiry +30g). ADR-038: persist
 *    istenip DB yazımı BAŞARISIZSA sonuç `persistence_failed` olur — yalnız
 *    bellekteki kanıt named-tool'u asla "ready" yapamaz.
 *  - Başarısızlık TYPED koddur; ham exception/iç host detayı sızdırılmaz.
 *  - HTTP 4xx/5xx (404/451 dahil) BAŞARISIZLIK DEĞİLDİR: `opens:false` typed
 *    kanıttır (site cevap verdi; içerik durumu kanıtın kendisi).
 */

import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { assertSafeUrl, SsrfBlockedError, type ResolveHost } from "@/lib/verify/ssrfGuard";

export const VERIFY_USER_AGENT = "CemOS-Verify/1.0 (website evidence check)";
const MAX_HOPS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const EVIDENCE_TTL_DAYS = 30;
const ROBOTS_MAX_BYTES = 64_000;
/** Aynı URL'in bu pencere içindeki taze snapshot'ı normal üretimde reuse edilir. */
export const FRESH_REUSE_MS = 24 * 60 * 60 * 1000;

const UnknownOr = <T extends z.ZodTypeAny>(inner: T) => z.union([inner, z.literal("unknown")]);

export const VerificationEvidenceSchema = z.object({
  opens: z.boolean(),
  finalUrl: z.string().url(),
  redirectChain: z.array(z.string()),
  signupRequired: UnknownOr(z.boolean()),
  freeTier: UnknownOr(z.boolean()),
  usageLimits: UnknownOr(z.string()),
  exportDownload: UnknownOr(z.boolean()),
  commercialUse: UnknownOr(z.string()),
  regionRestricted: UnknownOr(z.boolean()),
  lastUpdated: UnknownOr(z.string()),
  checkedAt: z.coerce.date(),
  expiry: z.coerce.date(),
  screenshotUrl: z.string().url().optional(),
});
export type VerificationEvidence = z.infer<typeof VerificationEvidenceSchema>;

/** Typed başarısızlık kodları — UI/route bu kodları gösterir, ham hata asla. */
export type VerifyFailureCode =
  | "invalid_url"
  | "ssrf_blocked"
  | "redirect_blocked"
  | "redirect_hop_limit"
  | "robots_disallowed"
  | "timeout"
  | "unreachable"
  | "persistence_failed"
  | "unknown_failure";

export const VERIFY_FAILURE_MESSAGE: Record<VerifyFailureCode, string> = {
  invalid_url: "URL geçersiz.",
  ssrf_blocked: "SSRF koruması bu hedefi engelledi.",
  redirect_blocked: "Yönlendirme güvenli şekilde çözülemedi.",
  redirect_hop_limit: "Yönlendirme zinciri limiti aşıldı.",
  robots_disallowed: "robots.txt bu sayfanın doğrulanmasına izin vermiyor.",
  timeout: "Site zaman aşımında yanıt vermedi.",
  unreachable: "Siteye ulaşılamadı.",
  persistence_failed: "Kanıt kalıcı olarak kaydedilemedi — doğrulama geçersiz sayıldı.",
  unknown_failure: "Doğrulama bilinmeyen bir nedenle tamamlanamadı.",
};

export type VerifyWebsiteResult =
  | { ok: true; evidence: VerificationEvidence; verificationId?: string; reused?: boolean }
  | { ok: false; code: VerifyFailureCode; reason: string };

export type VerifyOptions = {
  fetchImpl?: typeof fetch;
  resolveHost?: ResolveHost;
  /** true → kanıt WebsiteVerification satırına yazılır (yazım başarısızsa sonuç da başarısız). */
  persist?: boolean;
};

function failure(code: VerifyFailureCode): VerifyWebsiteResult {
  return { ok: false, code, reason: VERIFY_FAILURE_MESSAGE[code] };
}

async function timedFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Response gövdesini en fazla maxBytes okuyup keser (bounded read). */
async function boundedText(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) return (await res.text()).slice(0, maxBytes);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* zaten kapalı olabilir */
    }
  }
  const joined = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    const room = joined.length - offset;
    if (room <= 0) break;
    joined.set(room >= c.byteLength ? c : c.subarray(0, room), offset);
    offset += Math.min(room, c.byteLength);
  }
  return new TextDecoder().decode(joined);
}

/** Çok basit robots.txt kontrolü: '*' UA'sı için Disallow path eşleşmesi. */
export function isDisallowedByRobots(robotsTxt: string, path: string): boolean {
  let applies = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const k = key.trim().toLowerCase();
    if (k === "user-agent") {
      applies = value === "*" || VERIFY_USER_AGENT.toLowerCase().includes(value.toLowerCase());
    } else if (applies && k === "disallow" && value) {
      if (path.startsWith(value)) return true;
    }
  }
  return false;
}

async function checkRobots(
  fetchImpl: typeof fetch,
  target: URL,
  resolveHost?: ResolveHost
): Promise<boolean> {
  try {
    const robotsUrl = `${target.protocol}//${target.host}/robots.txt`;
    await assertSafeUrl(robotsUrl, resolveHost);
    const res = await timedFetch(fetchImpl, robotsUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": VERIFY_USER_AGENT },
    });
    if (!res.ok) return false; // robots yok/erişilemez → engel yok say
    const text = await boundedText(res, ROBOTS_MAX_BYTES);
    return isDisallowedByRobots(text, target.pathname || "/");
  } catch {
    return false; // fail-open: robots okunamadıysa doğrulamayı kesme
  }
}

function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.name === "TimeoutError" || /abort/i.test(err.message))
  );
}

/**
 * Tier-1 HTTP doğrulaması. Ağ hataları/SSRF ihlalleri typed `{ok:false, code}`
 * döner — throw etmez, ham hata mesajı sızdırmaz.
 */
export async function verifyWebsite(
  rawUrl: string,
  opts: VerifyOptions = {}
): Promise<VerifyWebsiteResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const redirectChain: string[] = [];

  try {
    new URL(rawUrl);
  } catch {
    return failure("invalid_url");
  }

  let current: string = rawUrl;
  try {
    let firstHop = true;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const safe = await assertSafeUrl(current, opts.resolveHost);

      if (firstHop) {
        firstHop = false;
        if (await checkRobots(fetchImpl, safe, opts.resolveHost)) {
          return failure("robots_disallowed");
        }
      }

      const res = await timedFetch(fetchImpl, safe.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": VERIFY_USER_AGENT, Accept: "text/html,*/*" },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return failure("redirect_blocked");
        let nextUrl: string;
        try {
          nextUrl = new URL(location, safe).toString();
        } catch {
          return failure("redirect_blocked");
        }
        redirectChain.push(nextUrl);
        if (hop === MAX_HOPS) return failure("redirect_hop_limit");
        current = nextUrl; // sonraki hop başta guard'dan geçer
        continue;
      }

      const evidence: VerificationEvidence = VerificationEvidenceSchema.parse({
        opens: res.status >= 200 && res.status < 300,
        finalUrl: safe.toString(),
        redirectChain,
        signupRequired: "unknown",
        freeTier: "unknown",
        usageLimits: "unknown",
        exportDownload: "unknown",
        commercialUse: "unknown",
        // 451 = yasal engel kanıtı; onun DIŞINDA Türkiye erişimi iddia edilmez.
        regionRestricted: res.status === 451 ? true : "unknown",
        lastUpdated: res.headers.get("last-modified") ?? "unknown",
        checkedAt: new Date(),
        expiry: new Date(Date.now() + EVIDENCE_TTL_DAYS * 24 * 60 * 60 * 1000),
      });

      let verificationId: string | undefined;
      if (opts.persist) {
        try {
          const row = await prisma.websiteVerification.create({
            data: {
              url: rawUrl,
              finalUrl: evidence.finalUrl,
              opens: evidence.opens,
              redirectChain: JSON.stringify(evidence.redirectChain),
              evidenceJson: JSON.stringify(evidence),
              checkedAt: evidence.checkedAt,
              expiry: evidence.expiry,
            },
          });
          verificationId = row.id;
        } catch {
          // ADR-038: fail-soft persist KALDIRILDI — kalıcı satır yoksa kanıt yok.
          return failure("persistence_failed");
        }
      }
      return { ok: true, evidence, verificationId };
    }
    return failure("redirect_hop_limit");
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      // Kod bazlı ayrım: URL parse/şema/credential ihlali de SSRF guard'ından gelir.
      return failure("ssrf_blocked");
    }
    if (isTimeoutError(err)) return failure("timeout");
    if (err instanceof TypeError) return failure("unreachable"); // undici fetch ağ hatası
    return failure("unknown_failure");
  }
}

/**
 * Snapshot reuse'lu doğrulama (ADR-038 §B). WebsiteVerification append-only
 * kanıt defteridir: eski satır ASLA overwrite edilmez, her canlı doğrulama
 * yeni satır üretir. `forceRefresh:false` iken aynı `url` için çok taze
 * (≤ FRESH_REUSE_MS) ve strict-parse edilebilir son snapshot reuse edilir;
 * bozuk/bayat snapshot fail-closed atlanır ve canlı doğrulamaya düşülür.
 */
export async function verifyWebsiteWithReuse(
  rawUrl: string,
  opts: VerifyOptions & { forceRefresh?: boolean; nowMs?: number } = {}
): Promise<VerifyWebsiteResult> {
  const now = opts.nowMs ?? Date.now();
  if (!opts.forceRefresh) {
    try {
      const row = await prisma.websiteVerification.findFirst({
        where: { url: rawUrl, checkedAt: { gte: new Date(now - FRESH_REUSE_MS) } },
        orderBy: { checkedAt: "desc" },
      });
      if (row) {
        const parsed = VerificationEvidenceSchema.safeParse(
          (() => {
            try {
              return JSON.parse(row.evidenceJson);
            } catch {
              return null;
            }
          })()
        );
        const fresh =
          parsed.success &&
          new Date(row.expiry).getTime() > now &&
          parsed.data.finalUrl === row.finalUrl &&
          parsed.data.opens === row.opens;
        if (fresh && parsed.success) {
          return { ok: true, evidence: parsed.data, verificationId: row.id, reused: true };
        }
        // Bozuk/uyumsuz snapshot: sessiz reuse YOK — canlı doğrulamaya düş.
      }
    } catch {
      /* reuse okuması başarısızsa canlı doğrulamaya düş */
    }
  }
  return verifyWebsite(rawUrl, { ...opts, persist: true });
}
