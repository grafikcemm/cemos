import { describe, it, expect } from "vitest";
import {
  canonicalizeInstagramUrl,
  externalIdFromShortcode,
  stableExternalIdFromUrl,
} from "./instagramUrl";

describe("canonicalizeInstagramUrl", () => {
  it("reel URL'sini canonical forma indirger (query/fragment atılır)", () => {
    const r = canonicalizeInstagramUrl("https://www.instagram.com/reel/Cxyz12345/?igsh=abc#top");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.canonicalUrl).toBe("https://www.instagram.com/reel/Cxyz12345/");
      expect(r.shortcode).toBe("Cxyz12345");
      expect(r.kind).toBe("reel");
      expect(r.formatHint).toBe("ig_reel");
      expect(r.externalId).toBe("shortcode_Cxyz12345");
    }
  });

  it("/reels/ alias'ı ve m.instagram.com host'u reel'e normalize olur", () => {
    const r = canonicalizeInstagramUrl("http://m.instagram.com/reels/Babc_-999/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonicalUrl).toBe("https://www.instagram.com/reel/Babc_-999/");
  });

  it("/p/ formatı carousel/statik olabilir → formatHint unknown", () => {
    const r = canonicalizeInstagramUrl("instagram.com/p/Cpost1234/");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("p");
      expect(r.formatHint).toBe("unknown");
    }
  });

  it("/tv/ desteklenir (video)", () => {
    const r = canonicalizeInstagramUrl("https://instagram.com/tv/Ctv456789");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.formatHint).toBe("ig_reel");
  });

  it("kullanıcılı biçim /{user}/reel/{code} çözülür", () => {
    const r = canonicalizeInstagramUrl("https://www.instagram.com/grafikcem/reel/Cuser0001/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shortcode).toBe("Cuser0001");
  });

  it("scheme'siz yapıştırma kullanıcı dostu kabul edilir", () => {
    const r = canonicalizeInstagramUrl("www.instagram.com/reel/Cnoscheme1/");
    expect(r.ok).toBe(true);
  });

  it("http/https dışı scheme reddedilir", () => {
    const r = canonicalizeInstagramUrl("javascript:alert(1)");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["unsafe_scheme", "not_instagram_host", "invalid_url"]).toContain(r.reason);
  });

  it("Instagram olmayan host reddedilir (subdomain taklidi dahil)", () => {
    expect(canonicalizeInstagramUrl("https://evil.com/reel/Cxyz12345/").ok).toBe(false);
    expect(canonicalizeInstagramUrl("https://instagram.com.evil.com/reel/Cxyz12345/").ok).toBe(false);
  });

  it("profil/story URL'si dürüst reddedilir (post değil)", () => {
    const r = canonicalizeInstagramUrl("https://www.instagram.com/grafikcem/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsupported_path");
  });

  it("share/ kısaltması fetch olmadan çözülemez → dürüst red", () => {
    const r = canonicalizeInstagramUrl("https://www.instagram.com/share/abc123xyz");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("share_link_unresolvable");
  });

  it("geçersiz shortcode reddedilir", () => {
    const r = canonicalizeInstagramUrl("https://www.instagram.com/reel/ab/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_shortcode");
  });

  it("boş/bozuk girdi invalid_url", () => {
    expect(canonicalizeInstagramUrl("").ok).toBe(false);
    expect(canonicalizeInstagramUrl("ht tp://x").ok).toBe(false);
  });
});

describe("stabil externalId üretimi", () => {
  it("shortcode prefix'i Meta numeric media ID uzayıyla çakışmaz", () => {
    expect(externalIdFromShortcode("Cxyz12345")).toBe("shortcode_Cxyz12345");
  });

  it("hash fallback deterministiktir", () => {
    const a = stableExternalIdFromUrl("https://www.instagram.com/reel/X12345/");
    const b = stableExternalIdFromUrl("https://www.instagram.com/reel/X12345/");
    expect(a).toBe(b);
    expect(a).toMatch(/^urlhash_[0-9a-f]{16}$/);
  });
});
