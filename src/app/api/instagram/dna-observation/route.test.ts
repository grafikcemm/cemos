import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** GET gözlem endpoint'i: guard, gözlem/onaylı-DNA ayrımı, hesap eşleşmesi. */

const authorized = vi.fn();
vi.mock("@/lib/utils/sameOriginGuard", () => ({
  isOperatorOrCronAuthorized: (r: unknown) => authorized(r),
}));

const getObservation = vi.fn();
vi.mock("@/lib/instagram/dnaObservationService", () => ({
  getInstagramDnaObservation: () => getObservation(),
}));

const captionFindUnique = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: { captionDna: { findUnique: (a: unknown) => captionFindUnique(a) } },
}));

import { GET } from "./route";

function req(qs = ""): NextRequest {
  return new NextRequest(`http://localhost:3000/api/instagram/dna-observation${qs}`);
}

const OBSERVATION = {
  sampleSufficiency: "sufficient",
  evidenceCount: 20,
  hookDistribution: { soru: 12, iddia: 8 },
  captionLength: { min: 50, max: 700, median: 300 },
  paragraphPattern: "cok_paragraf",
  emoji: { ratio: 0.1, policy: "sparse" },
  ctaEndingDistribution: { soru: 2, yonlendirme: 14, yok: 4 },
  hashtag: { countRange: { min: 2, max: 6 }, placement: "end", casing: "lower", coreTags: [], rotatingTags: [] },
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  authorized.mockReturnValue(true);
  getObservation.mockResolvedValue({
    status: "ok",
    reason: "hazır",
    account: { id: "acc-1", handle: "grafikcem" },
    binding: { provider: "composio", staleSync: false },
    observation: OBSERVATION,
  });
  captionFindUnique.mockResolvedValue({
    openingHookTypes: '["soru"]',
    emojiPolicy: "none",
    provenance: "operator",
    version: 2,
  });
});

describe("GET /api/instagram/dna-observation", () => {
  it("guard: 403", async () => {
    authorized.mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(getObservation).not.toHaveBeenCalled();
  });

  it("gözlem ile onaylı DNA ayrı bloklarda döner", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.observation.evidenceCount).toBe(20);
    expect(json.approved.captionDna.provenance).toBe("operator");
    expect(json.approved.captionDna.version).toBe(2);
    // Öneri değerleri yalnız yeterli örneklemde.
    expect(json.proposedCaptionDnaValues.emojiPolicy).toBe("sparse");
  });

  it("yetersiz örneklemde öneri değeri üretilmez", async () => {
    getObservation.mockResolvedValue({
      status: "ok",
      reason: "hazır",
      account: { id: "acc-1", handle: "grafikcem" },
      binding: { provider: "composio", staleSync: false },
      observation: { ...OBSERVATION, sampleSufficiency: "insufficient" },
    });
    const res = await GET(req());
    const json = await res.json();
    expect(json.proposedCaptionDnaValues).toBeNull();
  });

  it("accountId sözleşme hesabıyla uyuşmazsa 422", async () => {
    const res = await GET(req("?accountId=baska"));
    expect(res.status).toBe(422);
  });

  it("binding yoksa status geçer, approved boş", async () => {
    getObservation.mockResolvedValue({ status: "config_required", reason: "binding yok" });
    const res = await GET(req());
    const json = await res.json();
    expect(json.status).toBe("config_required");
    expect(json.approved.captionDna).toBeNull();
    expect(captionFindUnique).not.toHaveBeenCalled();
  });
});
