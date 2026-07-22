import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Phase 3C §D: ücretli AI uyarlaması AYRI eylemdir ve fail-closed'dur.
 *  - Instagram + kapı kapalı → SIFIR ağ çağrısı, SIFIR Idea, SIFIR UsageLog.
 *  - Geçersiz model çıktısı → Idea YAZILMAZ.
 *  - 24 saat idempotency: retry duplicate maliyet/Idea üretmez.
 */

const generateMock = vi.fn();
const ideaCreate = vi.fn();
const setAnalysisStatus = vi.fn();
const getById = vi.fn();
const ideaSourceFindFirst = vi.fn();

vi.mock("@/lib/ai/generateGated", () => ({
  generateJsonGated: (a: unknown) => generateMock(a),
}));
vi.mock("@/lib/db/ideaRepo", () => ({
  ideaRepo: { create: (a: unknown) => ideaCreate(a) },
}));
vi.mock("@/lib/db/contentItemRepo", () => ({
  contentItemRepo: {
    getById: (a: unknown) => getById(a),
    setAnalysisStatus: (...a: unknown[]) => setAnalysisStatus(...a),
  },
}));
vi.mock("@/lib/db/client", () => ({
  prisma: { ideaSource: { findFirst: (a: unknown) => ideaSourceFindFirst(a) } },
}));

import {
  reverseEngineerToIdea,
  ReverseEngineerBlockedError,
  ReverseEngineerInvalidOutputError,
} from "./reverseEngineer";

const VALID_OUTPUT = {
  hookType: "soru",
  whyItWorked: "Merak boşluğu",
  targetEmotion: "merak",
  transferablePatterns: ["soru hook"],
  nonTransferable: ["kişisel ton"],
  copyingRisk: "low",
  suggestedAngle: "Kendi örneğinle",
  suggestedHook: "Neden kimse bunu söylemiyor?",
  bodyOutline: "1) giriş 2) gövde",
  confidence: 0.8,
};

const IG_ITEM = {
  id: "ci-1",
  platform: "instagram",
  format: "ig_reel",
  title: "t",
  body: "caption",
};

beforeEach(() => {
  vi.clearAllMocks();
  getById.mockResolvedValue(IG_ITEM);
  ideaSourceFindFirst.mockResolvedValue(null);
  ideaCreate.mockResolvedValue({ id: "idea-1", modelUsed: "m" });
  setAnalysisStatus.mockResolvedValue({});
  generateMock.mockResolvedValue({ data: VALID_OUTPUT, actualCostUsd: 0.01, model: "mock-model" });
  delete process.env.OPENROUTER_KEY_ROTATED_AT;
  delete process.env.INSTAGRAM_GENERATION_ENABLED;
  delete process.env.INSTAGRAM_GENERATION_LIVE_APPROVED;
  delete process.env.INSTAGRAM_GENERATION_MAX_USD;
});

afterEach(() => {
  delete process.env.OPENROUTER_KEY_ROTATED_AT;
  delete process.env.INSTAGRAM_GENERATION_ENABLED;
  delete process.env.INSTAGRAM_GENERATION_LIVE_APPROVED;
  delete process.env.INSTAGRAM_GENERATION_MAX_USD;
});

function openGate() {
  process.env.OPENROUTER_KEY_ROTATED_AT = "2026-07-18T00:00:00Z";
  process.env.INSTAGRAM_GENERATION_ENABLED = "true";
  process.env.INSTAGRAM_GENERATION_LIVE_APPROVED = "true";
  process.env.INSTAGRAM_GENERATION_MAX_USD = "0.25";
}

describe("reverseEngineerToIdea — Phase 3C sertleştirmesi", () => {
  it("Instagram + kapı kapalı → typed blocked; SIFIR ağ, SIFIR Idea, SIFIR analiz-yazımı", async () => {
    await expect(
      reverseEngineerToIdea({ contentItemId: "ci-1", accountId: "acc-1" }),
    ).rejects.toBeInstanceOf(ReverseEngineerBlockedError);
    expect(generateMock).not.toHaveBeenCalled();
    expect(ideaCreate).not.toHaveBeenCalled();
    expect(setAnalysisStatus).not.toHaveBeenCalled();
  });

  it("blocked hatası yalnız ENV ADLARI taşır (değer yok)", async () => {
    const err = await reverseEngineerToIdea({ contentItemId: "ci-1", accountId: "acc-1" }).catch((e) => e);
    expect(err).toBeInstanceOf(ReverseEngineerBlockedError);
    expect(err.missing).toContain("OPENROUTER_KEY_ROTATED_AT");
    expect(err.missing).toContain("INSTAGRAM_GENERATION_ENABLED");
  });

  it("X içeriği Instagram kapısına takılmaz (mevcut bütçe kapısı geçerli kalır)", async () => {
    getById.mockResolvedValue({ ...IG_ITEM, platform: "x", format: "x_single" });
    const r = await reverseEngineerToIdea({ contentItemId: "ci-1", accountId: "acc-1" });
    expect(r.idea.id).toBe("idea-1");
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("kapı açık + geçerli çıktı → Zod'dan geçer, Idea yazılır", async () => {
    openGate();
    const r = await reverseEngineerToIdea({ contentItemId: "ci-1", accountId: "acc-1" });
    expect(r.reused).toBe(false);
    expect(r.analysis?.copyingRisk).toBe("low");
    expect(ideaCreate).toHaveBeenCalledTimes(1);
    // Untrusted fence prompt'ta — forge-safe wrapUntrustedData (SEC hardening)
    const call = generateMock.mock.calls[0][0] as { user: string };
    expect(call.user).toContain("<<<KAYNAK_VERI>>>");
  });

  it("geçersiz model çıktısı → Idea YAZILMAZ (typed hata)", async () => {
    openGate();
    generateMock.mockResolvedValue({ data: { hookType: "" }, actualCostUsd: 0.01, model: "m" });
    await expect(
      reverseEngineerToIdea({ contentItemId: "ci-1", accountId: "acc-1" }),
    ).rejects.toBeInstanceOf(ReverseEngineerInvalidOutputError);
    expect(ideaCreate).not.toHaveBeenCalled();
    expect(setAnalysisStatus).not.toHaveBeenCalled();
  });

  it("24 saat penceresinde mevcut Idea → retry LLM ÇAĞIRMAZ, duplicate Idea yok", async () => {
    openGate();
    ideaSourceFindFirst.mockResolvedValue({ idea: { id: "idea-existing", modelUsed: "m0" } });
    const r = await reverseEngineerToIdea({ contentItemId: "ci-1", accountId: "acc-1" });
    expect(r.reused).toBe(true);
    expect(r.costUsd).toBe(0);
    expect(r.idea.id).toBe("idea-existing");
    expect(generateMock).not.toHaveBeenCalled();
    expect(ideaCreate).not.toHaveBeenCalled();
  });
});
