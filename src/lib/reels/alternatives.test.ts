import { describe, it, expect } from "vitest";
import {
  parseAlternatives,
  serializeAlternatives,
  alternativeEvidenceState,
  activeAlternatives,
  ALTERNATIVES_SCHEMA_VERSION,
  type DossierAlternative,
} from "./alternatives";

/**
 * Alternatif zinciri sözleşmesi (ADR-038 §E): versioned strict zarf,
 * fail-closed parse, türetilmiş evidence durumu (manuel işaret yok).
 */

function alt(overrides: Partial<DossierAlternative> = {}): DossierAlternative {
  return {
    id: "alt-1",
    name: "Yedek Araç",
    submittedUrl: "https://yedek.example.com/",
    finalUrl: null,
    verificationId: null,
    opens: null,
    checkedAt: null,
    expiry: null,
    status: "active",
    archivedAt: null,
    createdAt: "2026-07-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("parseAlternatives — fail-closed strict zarf", () => {
  it("boş/varsayılan değerler temiz boş liste döner (parseFailed=false)", () => {
    for (const raw of [null, undefined, "", "[]", "{}"]) {
      const r = parseAlternatives(raw);
      expect(r.alternatives).toEqual([]);
      expect(r.parseFailed).toBe(false);
    }
  });

  it("geçerli zarf roundtrip: serialize → parse kayıpsız", () => {
    const list = [alt(), alt({ id: "alt-2", submittedUrl: "https://b.example.com/", status: "archived", archivedAt: "2026-07-18T11:00:00.000Z" })];
    const r = parseAlternatives(serializeAlternatives(list));
    expect(r.parseFailed).toBe(false);
    expect(r.alternatives).toEqual(list);
  });

  it("legacy düz dizi ([{name,url}]) fail-closed: boş liste + parseFailed", () => {
    const r = parseAlternatives(JSON.stringify([{ name: "Eski", url: "https://x.example" }]));
    expect(r.alternatives).toEqual([]);
    expect(r.parseFailed).toBe(true);
  });

  it("bozuk JSON fail-closed", () => {
    const r = parseAlternatives("{not json");
    expect(r.alternatives).toEqual([]);
    expect(r.parseFailed).toBe(true);
  });

  it("bilinmeyen alan strict şemada reddedilir (fail-closed)", () => {
    const r = parseAlternatives(
      JSON.stringify({
        schemaVersion: ALTERNATIVES_SCHEMA_VERSION,
        alternatives: [{ ...alt(), manuallyVerified: true }],
      })
    );
    expect(r.alternatives).toEqual([]);
    expect(r.parseFailed).toBe(true);
  });
});

describe("alternativeEvidenceState — TÜRETİLMİŞ durum (manuel işaret yok)", () => {
  const now = Date.parse("2026-07-18T12:00:00Z");

  it("verificationId yok → unverified (opens=true iddiası bile yetmez)", () => {
    expect(alternativeEvidenceState(alt({ opens: true }), now)).toBe("unverified");
  });

  it("kendi doğrulaması var + açılıyor + taze → ready", () => {
    expect(
      alternativeEvidenceState(
        alt({ verificationId: "wv-9", opens: true, expiry: "2026-08-01T00:00:00.000Z" }),
        now
      )
    ).toBe("ready");
  });

  it("açılmıyor → failed; expiry geçmiş → stale", () => {
    expect(alternativeEvidenceState(alt({ verificationId: "wv-9", opens: false }), now)).toBe("failed");
    expect(
      alternativeEvidenceState(
        alt({ verificationId: "wv-9", opens: true, expiry: "2026-07-01T00:00:00.000Z" }),
        now
      )
    ).toBe("stale");
  });

  it("satır var ama açılış kanıtı yok (opens=null) → unverified", () => {
    expect(alternativeEvidenceState(alt({ verificationId: "wv-9", opens: null }), now)).toBe("unverified");
  });
});

describe("activeAlternatives", () => {
  it("arşivlenmişler dışlanır ama listede kalır (non-destructive)", () => {
    const list = [alt(), alt({ id: "alt-2", status: "archived" })];
    expect(activeAlternatives(list).map((a) => a.id)).toEqual(["alt-1"]);
    expect(list).toHaveLength(2);
  });
});
