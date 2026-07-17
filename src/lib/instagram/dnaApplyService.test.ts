import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DNA apply governance (Phase 3A §D): selected-fields-only, version bump,
 * stale→409/idempotent-retry, yetersiz kanıt→422, boş seçim mutation yapmaz.
 */

const captionFindUnique = vi.fn();
const captionCreate = vi.fn();
const captionUpdate = vi.fn();
const seriesFindUnique = vi.fn();
const seriesUpdate = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    captionDna: {
      findUnique: (a: unknown) => captionFindUnique(a),
      create: (a: unknown) => captionCreate(a),
      update: (a: unknown) => captionUpdate(a),
    },
    seriesProfile: {
      findUnique: (a: unknown) => seriesFindUnique(a),
      update: (a: unknown) => seriesUpdate(a),
    },
  },
}));

import {
  applyObservationToCaptionDna,
  applyObservationToSeriesHashtags,
  deriveCaptionDnaValues,
} from "./dnaApplyService";
import type { InstagramDnaObservation } from "./dnaObservationService";

function observation(overrides: Partial<InstagramDnaObservation> = {}): InstagramDnaObservation {
  return {
    policyVersion: "3A-1",
    evidenceCount: 24,
    dateRange: { from: "2026-06-01T00:00:00.000Z", to: "2026-07-15T00:00:00.000Z" },
    mediaTypeDistribution: { CAROUSEL_ALBUM: 18, REELS: 6 },
    hookDistribution: { soru: 10, rakam: 8, iddia: 6 },
    captionLength: { min: 80, max: 900, median: 340 },
    paragraphPattern: "cok_paragraf",
    emoji: { ratio: 0.2, policy: "sparse" },
    ctaEndingDistribution: { soru: 4, yonlendirme: 16, yok: 4 },
    hashtag: {
      countRange: { min: 3, max: 8 },
      placement: "end",
      casing: "lower",
      coreTags: ["#tasarim", "#ai"],
      rotatingTags: ["#figma"],
    },
    sampleSufficiency: "sufficient",
    performanceEvidence: "engagement_partial",
    sources: { igMedia: 24 },
    warnings: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  captionFindUnique.mockResolvedValue(null);
  captionCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...a.data, version: 1 })
  );
  captionUpdate.mockImplementation((a: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...a.data })
  );
  seriesUpdate.mockImplementation((a: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...a.data })
  );
});

describe("deriveCaptionDnaValues", () => {
  it("gözlemden alan değerlerini türetir; baskın CTA 'yok' ise ctaStyle üretmez", () => {
    const v = deriveCaptionDnaValues(observation());
    expect(JSON.parse(v.openingHookTypes as string)[0]).toBe("soru");
    expect(v.emojiPolicy).toBe("sparse");
    expect(v.ctaStyle).toBe("yonlendirme");

    const noCta = deriveCaptionDnaValues(
      observation({ ctaEndingDistribution: { soru: 0, yonlendirme: 0, yok: 9 } })
    );
    expect(noCta.ctaStyle).toBeUndefined();
  });
});

describe("applyObservationToCaptionDna", () => {
  it("boş seçim mutation yapmaz", async () => {
    const r = await applyObservationToCaptionDna({
      accountHandle: "grafikcem",
      selectedFields: [],
      expectedVersion: null,
      observation: observation(),
    });
    expect(r).toMatchObject({ ok: false, code: "empty_selection" });
    expect(captionCreate).not.toHaveBeenCalled();
    expect(captionUpdate).not.toHaveBeenCalled();
  });

  it("yetersiz örneklem → insufficient_evidence, yazma yok", async () => {
    const r = await applyObservationToCaptionDna({
      accountHandle: "grafikcem",
      selectedFields: ["emojiPolicy"],
      expectedVersion: null,
      observation: observation({ sampleSufficiency: "insufficient", evidenceCount: 3 }),
    });
    expect(r).toMatchObject({ ok: false, code: "insufficient_evidence" });
    expect(captionCreate).not.toHaveBeenCalled();
  });

  it("kanıtsız alan (ctaStyle, baskın 'yok') → insufficient_evidence", async () => {
    const r = await applyObservationToCaptionDna({
      accountHandle: "grafikcem",
      selectedFields: ["ctaStyle"],
      expectedVersion: null,
      observation: observation({ ctaEndingDistribution: { soru: 0, yonlendirme: 0, yok: 20 } }),
    });
    expect(r).toMatchObject({ ok: false, code: "insufficient_evidence" });
  });

  it("satır yokken create: yalnız seçili alanlar + provenance operator", async () => {
    const r = await applyObservationToCaptionDna({
      accountHandle: "grafikcem",
      selectedFields: ["emojiPolicy", "lineBreakPattern"],
      expectedVersion: null,
      observation: observation(),
    });
    expect(r).toMatchObject({ ok: true, version: 1, alreadyApplied: false });
    const data = captionCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.provenance).toBe("operator");
    expect(data.emojiPolicy).toBe("sparse");
    expect(data.lineBreakPattern).toBe("cok_paragraf");
    // Seçilmeyen alan yazılmadı (selected-fields-only).
    expect(data.openingHookTypes).toBeUndefined();
    expect(data.ctaStyle).toBeUndefined();
  });

  it("güncellemede version bump + yalnız seçili alanlar", async () => {
    captionFindUnique.mockResolvedValue({
      accountHandle: "grafikcem",
      emojiPolicy: "none",
      lineBreakPattern: "tek_blok",
      openingHookTypes: "[]",
      lengthRange: "{}",
      ctaStyle: null,
      provenance: "own_metric",
      version: 3,
    });
    const r = await applyObservationToCaptionDna({
      accountHandle: "grafikcem",
      selectedFields: ["emojiPolicy"],
      expectedVersion: 3,
      observation: observation(),
    });
    expect(r).toMatchObject({ ok: true, alreadyApplied: false });
    const data = captionUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.version).toBe(4);
    expect(data.provenance).toBe("operator");
    expect(data.emojiPolicy).toBe("sparse");
    expect(data.openingHookTypes).toBeUndefined();
  });

  it("stale version + farklı değer → version_conflict (yazma yok)", async () => {
    captionFindUnique.mockResolvedValue({
      accountHandle: "grafikcem",
      emojiPolicy: "none",
      version: 5,
    });
    const r = await applyObservationToCaptionDna({
      accountHandle: "grafikcem",
      selectedFields: ["emojiPolicy"],
      expectedVersion: 3,
      observation: observation(),
    });
    expect(r).toMatchObject({ ok: false, code: "version_conflict" });
    expect(captionUpdate).not.toHaveBeenCalled();
  });

  it("aynı onayın retry'ı: değerler zaten uygulanmış → idempotent alreadyApplied, duplicate version YOK", async () => {
    captionFindUnique.mockResolvedValue({
      accountHandle: "grafikcem",
      emojiPolicy: "sparse", // zaten uygulanmış
      version: 4,
    });
    const r = await applyObservationToCaptionDna({
      accountHandle: "grafikcem",
      selectedFields: ["emojiPolicy"],
      expectedVersion: 3, // stale (ilk apply v3→v4 yaptı)
      observation: observation(),
    });
    expect(r).toMatchObject({ ok: true, alreadyApplied: true, version: 4 });
    expect(captionUpdate).not.toHaveBeenCalled();
  });
});

describe("applyObservationToSeriesHashtags", () => {
  it("seri override: version + promptVersion bump", async () => {
    seriesFindUnique.mockResolvedValue({ id: "s1", hashtagDnaJson: "[]", version: 2 });
    const r = await applyObservationToSeriesHashtags({
      seriesId: "s1",
      expectedVersion: 2,
      observation: observation(),
    });
    expect(r).toMatchObject({ ok: true, alreadyApplied: false });
    const data = seriesUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.version).toBe(3);
    expect(data.promptVersion).toBe("v3");
    expect(JSON.parse(data.hashtagDnaJson as string)).toContain("#tasarim");
  });

  it("hashtag kanıtı yoksa 422 yolu", async () => {
    const r = await applyObservationToSeriesHashtags({
      seriesId: "s1",
      expectedVersion: 1,
      observation: observation({
        hashtag: {
          countRange: { min: 0, max: 0 },
          placement: "none",
          casing: "none",
          coreTags: [],
          rotatingTags: [],
        },
      }),
    });
    expect(r).toMatchObject({ ok: false, code: "insufficient_evidence" });
    expect(seriesFindUnique).not.toHaveBeenCalled();
  });

  it("stale + aynı değer → idempotent; stale + farklı → conflict; yok → not_found", async () => {
    const tagsJson = JSON.stringify(["#tasarim", "#ai", "#figma"]);
    seriesFindUnique.mockResolvedValue({ id: "s1", hashtagDnaJson: tagsJson, version: 3 });
    const idem = await applyObservationToSeriesHashtags({
      seriesId: "s1",
      expectedVersion: 2,
      observation: observation(),
    });
    expect(idem).toMatchObject({ ok: true, alreadyApplied: true, version: 3 });

    seriesFindUnique.mockResolvedValue({ id: "s1", hashtagDnaJson: "[]", version: 3 });
    const conflict = await applyObservationToSeriesHashtags({
      seriesId: "s1",
      expectedVersion: 2,
      observation: observation(),
    });
    expect(conflict).toMatchObject({ ok: false, code: "version_conflict" });

    seriesFindUnique.mockResolvedValue(null);
    const missing = await applyObservationToSeriesHashtags({
      seriesId: "s1",
      expectedVersion: 2,
      observation: observation(),
    });
    expect(missing).toMatchObject({ ok: false, code: "not_found" });
  });
});
