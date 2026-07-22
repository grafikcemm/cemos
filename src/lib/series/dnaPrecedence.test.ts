import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Generation grounding precedence (Phase 3A §G — ADR-035).
 *
 * Sözleşme: üretim YALNIZ onaylı DNA okur.
 *  1. Carousel prompt'u seri override'ını (SeriesProfile.hashtagDnaJson)
 *     kullanır; hesap-seviyesi HashtagDna'ya SESSİZ fallback yok, başka hesabın
 *     DNA'sına fallback ASLA yok.
 *  2. Hesap CaptionDna/HashtagDna'sı identity bloğuna yalnız kendi handle'ından
 *     girer (hesap izolasyonu).
 *  3. Gözlem (dnaObservationService çıktısı) hiçbir prompt kurucuya parametre
 *     olarak GİRMEZ — onaylanmamış değer üretime sızamaz (tip düzeyinde de
 *     doğrulanır: CarouselPromptInput'ta observation alanı yok).
 */

const captionFindUnique = vi.fn();
const hashtagFindFirst = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    captionDna: { findUnique: (a: unknown) => captionFindUnique(a) },
    hashtagDna: { findFirst: (a: unknown) => hashtagFindFirst(a) },
    // Prompt kurucular başka tabloya dokunursa mock'ta metod yok → test patlar.
  },
}));

vi.mock("@/lib/memory/constitutions", () => ({
  getVoiceConstitution: vi.fn(() => Promise.resolve(["Ses: net, süssüz."])),
}));
vi.mock("@/lib/memory/memoryFactService", () => ({
  getActiveFacts: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/ai/generateGated", () => ({
  generateJsonGated: vi.fn(),
}));

import { buildCarouselPrompt } from "./seriesService";
import { buildIdentityMemoryContext } from "@/lib/memory/retrieval";

const SERIES_BASE = {
  name: "Best AI Tools",
  purpose: "Araç tanıtımı",
  audience: "Tasarımcılar",
  objective: "save",
  slideCountRange: "6-8",
  coverFormula: "Sert iddia",
  slideArchetypesJson: '["cover","tool","cta"]',
  variableElementsJson: '["araçlar"]',
  ctaFormula: "kaydet",
  captionDnaJson: "{}",
  hashtagDnaJson: '["#seriozel","#override"]',
  bannedRepetitionJson: "[]",
  evaluationRubricJson: "[]",
  promptVersion: "v3",
};

beforeEach(() => {
  vi.clearAllMocks();
  captionFindUnique.mockResolvedValue(null);
  hashtagFindFirst.mockResolvedValue(null);
});

describe("carousel prompt — seri override önceliği", () => {
  it("seri hashtagDnaJson override'ı prompt'a girer", () => {
    const { user, system } = buildCarouselPrompt({ series: SERIES_BASE, topic: "konu" });
    const all = system + user;
    expect(all).toContain("#seriozel");
    expect(all).toContain("#override");
  });

  it("seri override boşsa hesap HashtagDna'sına SESSİZ fallback YOK", () => {
    const { user, system } = buildCarouselPrompt({
      series: { ...SERIES_BASE, hashtagDnaJson: "[]" },
      topic: "konu",
    });
    const all = system + user;
    // Prompt kurucu saf: DB'ye hiç gitmedi, hesap tag'i enjekte edilmedi.
    expect(hashtagFindFirst).not.toHaveBeenCalled();
    expect(all).not.toContain("#hesapgeneli");
  });

  it("gözlem tip düzeyinde prompt'a giremez (CarouselPromptInput'ta alan yok)", () => {
    type Input = Parameters<typeof buildCarouselPrompt>[0];
    // Derleme-zamanı sözleşme: observation alanı tanımsız.
    const hasObservationField: "observation" extends keyof Input ? true : false = false;
    expect(hasObservationField).toBe(false);
  });
});

describe("identity bloğu — hesap DNA izolasyonu", () => {
  it("yalnız istenen handle'ın onaylı DNA'sı okunur ve enjekte edilir", async () => {
    captionFindUnique.mockImplementation((a: { where: { accountHandle: string } }) =>
      a.where.accountHandle === "grafikcem"
        ? Promise.resolve({
            openingHookTypes: '["soru"]',
            signaturePhrases: "[]",
            forbiddenPhrases: "[]",
            emojiPolicy: "sparse",
            languageRegister: "casual",
          })
        : Promise.resolve(null)
    );
    hashtagFindFirst.mockImplementation((a: { where: { accountHandle: string } }) =>
      a.where.accountHandle === "grafikcem"
        ? Promise.resolve({ coreTags: '["#tasarim"]', placement: "end" })
        : Promise.resolve(null)
    );

    const ctx = await buildIdentityMemoryContext("grafikcem");
    expect(ctx.block).toContain("emoji: sparse");
    expect(ctx.block).toContain("#tasarim");
    // Sorgular hesap handle'ıyla kısıtlı (cross-account okuma yok).
    expect(captionFindUnique.mock.calls[0][0]).toMatchObject({
      where: { accountHandle: "grafikcem" },
    });
    expect(hashtagFindFirst.mock.calls[0][0]).toMatchObject({
      where: { accountHandle: "grafikcem", seriesId: null },
    });

    // Başka hesap: DNA'sı YOK → blokta öncekinin DNA'sı görünmez (fallback yok).
    const other = await buildIdentityMemoryContext("maskulenkod");
    expect(other.block).not.toContain("emoji: sparse");
    expect(other.block).not.toContain("#tasarim");
  });
});
