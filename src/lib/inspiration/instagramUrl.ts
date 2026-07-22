import { createHash } from "node:crypto";

/**
 * Instagram URL canonicalization (Phase 3C §A — saf, ağ yok, fetch yok).
 *
 * Yalnız http/https + gerçek Instagram host'ları kabul edilir; post URL
 * biçimleri: /reel/{code}, /reels/{code}, /p/{code}, /tv/{code} ve
 * /{kullanici}/reel|p/{code} varyantları. Query/fragment (igsh vb. paylaşım
 * parametreleri) canonical formdan atılır. Shortcode stabil externalId üretir;
 * `/share/…` kısaltmaları fetch olmadan çözülemez → dürüst red (scraping yasak).
 */

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,39}$/;
const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

export type InstagramUrlKind = "reel" | "p" | "tv";

export type CanonicalInstagramUrl =
  | {
      ok: true;
      canonicalUrl: string;
      shortcode: string;
      kind: InstagramUrlKind;
      /** URL'den türetilen format ipucu; kullanıcı beyanı bunu EZER. */
      formatHint: "ig_reel" | "unknown";
      externalId: string;
    }
  | { ok: false; reason: CanonicalUrlFailure; message: string };

export type CanonicalUrlFailure =
  | "invalid_url"
  | "unsafe_scheme"
  | "not_instagram_host"
  | "share_link_unresolvable"
  | "unsupported_path"
  | "invalid_shortcode";

const KIND_ALIASES: Record<string, InstagramUrlKind> = {
  reel: "reel",
  reels: "reel",
  p: "p",
  tv: "tv",
};

/** Canonical URL'den stabil hash tabanlı externalId (shortcode yoksa fallback). */
export function stableExternalIdFromUrl(canonicalUrl: string): string {
  return `urlhash_${createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 16)}`;
}

/** Shortcode'dan stabil externalId. Meta media ID'leri numeriktir; prefix çakışmayı imkânsız kılar. */
export function externalIdFromShortcode(shortcode: string): string {
  return `shortcode_${shortcode}`;
}

export function canonicalizeInstagramUrl(rawInput: string): CanonicalInstagramUrl {
  const raw = rawInput.trim();
  if (!raw) return { ok: false, reason: "invalid_url", message: "URL boş." };

  // Scheme'siz yapıştırmalar (instagram.com/reel/…) kullanıcı dostu kabul edilir.
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "invalid_url", message: "URL çözümlenemedi." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsafe_scheme", message: "Yalnız http/https URL kabul edilir." };
  }
  const host = url.hostname.toLowerCase();
  if (!INSTAGRAM_HOSTS.has(host)) {
    return { ok: false, reason: "not_instagram_host", message: "Instagram URL'si değil." };
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, reason: "not_instagram_host", message: "Beklenmeyen port." };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { ok: false, reason: "unsupported_path", message: "Bir gönderi (reel/p/tv) URL'si gerekli." };
  }

  if (segments[0].toLowerCase() === "share") {
    return {
      ok: false,
      reason: "share_link_unresolvable",
      message: "share/ kısaltması fetch olmadan çözülemez — gönderinin gerçek URL'sini yapıştır.",
    };
  }

  // Biçim 1: /{kind}/{shortcode}  ·  Biçim 2: /{username}/{kind}/{shortcode}
  let kindSeg: string | undefined;
  let codeSeg: string | undefined;
  if (KIND_ALIASES[segments[0].toLowerCase()]) {
    kindSeg = segments[0].toLowerCase();
    codeSeg = segments[1];
  } else if (
    segments.length >= 3 &&
    USERNAME_RE.test(segments[0].toLowerCase()) &&
    KIND_ALIASES[segments[1].toLowerCase()]
  ) {
    kindSeg = segments[1].toLowerCase();
    codeSeg = segments[2];
  }

  if (!kindSeg || !codeSeg) {
    return {
      ok: false,
      reason: "unsupported_path",
      message: "Yalnız /reel/, /p/ ve /tv/ gönderi URL'leri kaydedilebilir (profil/story değil).",
    };
  }
  if (!SHORTCODE_RE.test(codeSeg)) {
    return { ok: false, reason: "invalid_shortcode", message: "Gönderi kodu (shortcode) geçersiz." };
  }

  const kind = KIND_ALIASES[kindSeg];
  const canonicalUrl = `https://www.instagram.com/${kind}/${codeSeg}/`;
  return {
    ok: true,
    canonicalUrl,
    shortcode: codeSeg,
    kind,
    // reel/tv kesin video; /p/ carousel VEYA statik olabilir — piksel analizi
    // yapılmadığı için "unknown" (kullanıcı beyanı capture'da override eder).
    formatHint: kind === "p" ? "unknown" : "ig_reel",
    externalId: externalIdFromShortcode(codeSeg),
  };
}
