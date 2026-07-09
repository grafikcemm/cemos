/**
 * verifyWebsite() — Tier 1 HTTP (Sprint 4, FINAL-CONTENT-ENGINE-SPEC §4.1).
 *
 * Deterministik, LLM'siz, otoriter doğrulayıcı: Reels dossier'inin "araç
 * gerçekten açılıyor mu?" kanıt kaynağı. LLM çıktısı HTTP doğrulamanın yerine
 * ASLA geçmez (Bard→Gemini redirect PoC'u bu modülün varlık sebebi).
 *
 *  - Redirect'ler OTOMATİK TAKİP EDİLMEZ: her `Location` hop'u SSRF
 *    guard'ından yeniden geçer, hop ≤ MAX_HOPS.
 *  - robots.txt okunur/uyulur (Disallow eşleşirse doğrulama yapılmaz).
 *  - Render-tier sinyalleri (signup/freeTier/…) bu tier'da 'unknown' (C10:
 *    Playwright escalation ayrı go/no-go).
 *  - Kanıt Zod `VerificationEvidence` olarak doğrulanır; opsiyonel olarak
 *    `WebsiteVerification` satırına yazılır (expiry +30g).
 */

import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { assertSafeUrl, SsrfBlockedError, type ResolveHost } from "@/lib/verify/ssrfGuard";

export const VERIFY_USER_AGENT = "CemOS-Verify/1.0 (website evidence check)";
const MAX_HOPS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const EVIDENCE_TTL_DAYS = 30;

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

export type VerifyWebsiteResult =
  | { ok: true; evidence: VerificationEvidence; verificationId?: string }
  | { ok: false; reason: string };

export type VerifyOptions = {
  fetchImpl?: typeof fetch;
  resolveHost?: ResolveHost;
  /** true → kanıt WebsiteVerification satırına yazılır. */
  persist?: boolean;
};

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
    const text = (await res.text()).slice(0, 64_000);
    return isDisallowedByRobots(text, target.pathname || "/");
  } catch {
    return false; // fail-open: robots okunamadıysa doğrulamayı kesme
  }
}

/**
 * Tier-1 HTTP doğrulaması. Ağ hataları/SSRF ihlalleri `{ok:false}` döner —
 * throw etmez (çağıran dossier'i `not_ready` işaretler).
 */
export async function verifyWebsite(
  rawUrl: string,
  opts: VerifyOptions = {}
): Promise<VerifyWebsiteResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const redirectChain: string[] = [];

  let current: string = rawUrl;
  try {
    let firstHop = true;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const safe = await assertSafeUrl(current, opts.resolveHost);

      if (firstHop) {
        firstHop = false;
        if (await checkRobots(fetchImpl, safe, opts.resolveHost)) {
          return { ok: false, reason: "robots_disallowed" };
        }
      }

      const res = await timedFetch(fetchImpl, safe.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": VERIFY_USER_AGENT, Accept: "text/html,*/*" },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { ok: false, reason: `redirect_without_location:${res.status}` };
        const nextUrl = new URL(location, safe).toString();
        redirectChain.push(nextUrl);
        if (hop === MAX_HOPS) return { ok: false, reason: "redirect_hop_limit" };
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
          /* kanıt DB'ye yazılamadıysa yine döner (fail-soft persist) */
        }
      }
      return { ok: true, evidence, verificationId };
    }
    return { ok: false, reason: "redirect_hop_limit" };
  } catch (err) {
    if (err instanceof SsrfBlockedError) return { ok: false, reason: err.message };
    return { ok: false, reason: err instanceof Error ? err.message : "fetch_failed" };
  }
}
