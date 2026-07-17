import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Carousel generator (ADR-036 §C): kapı kapalıyken sıfır ağ/DB, hesap/seri
 * fail-closed, strict Zod, deterministik doğrulama, near-copy fail-closed,
 * invalid çıktı persist edilmez, retry duplicate dossier üretmez.
 */

const accountFindUnique = vi.fn();
const dossierFindFirst = vi.fn();
const dossierCreate = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: (a: unknown) => accountFindUnique(a) },
    reelDossier: {
      findFirst: (a: unknown) => dossierFindFirst(a),
      create: (a: unknown) => dossierCreate(a),
    },
  },
}));

const gateFn = vi.fn();
vi.mock("@/lib/config/productGates", () => ({
  getInstagramGenerationGate: () => gateFn(),
}));

const getProfile = vi.fn();
vi.mock("@/lib/accounts/profileRepository", async (orig) => {
  const real = await orig<typeof import("@/lib/accounts/profileRepository")>();
  return {
    AccountProfileError: real.AccountProfileError,
    getRuntimeProfile: (h: string, o: unknown) => getProfile(h, o),
  };
});

const identityCtx = vi.fn();
vi.mock("@/lib/memory/retrieval", () => ({
  buildIdentityMemoryContext: (h: string) => identityCtx(h),
}));

const getSeriesMock = vi.fn();
const getExamplesMock = vi.fn();
vi.mock("@/lib/series/seriesService", async (orig) => {
  const real = await orig<typeof import("@/lib/series/seriesService")>();
  return {
    ...real,
    getSeries: (a: string, k: string) => getSeriesMock(a, k),
    getSeriesExamples: (a: string, k: string) => getExamplesMock(a, k),
  };
});

const verifyMock = vi.fn();
vi.mock("@/lib/verify/verifyWebsite", () => ({
  verifyWebsite: (u: string, o: unknown) => verifyMock(u, o),
}));

const runStageMock = vi.fn();
const flushMock = vi.fn();
vi.mock("@/lib/agents/pipeline-runner", () => ({
  createPipelineTrace: () => ({
    runStage: (o: unknown) => runStageMock(o),
    flush: (c: number) => flushMock(c),
    stages: [] as unknown[],
  }),
}));

import {
  generateCarouselEpisode,
  validateCarouselCandidate,
  normalizeHashtags,
  parseSlideCountRange,
  type CarouselOutput,
} from "./carouselGenerator";

const SERIES = {
  id: "sp-1",
  accountId: "acc-1",
  seriesKey: "best_ai_tools",
  version: 3,
  promptVersion: "v3",
  objective: "save",
  slideCountRange: "3-5",
  coverFormula: "iddia",
  slideArchetypesJson: "[]",
  variableElementsJson: "[]",
  ctaFormula: "kaydet",
  captionDnaJson: "{}",
  hashtagDnaJson: '["#aitools"]',
  bannedRepetitionJson: '["oyunun kuralları değişti"]',
  pastTopicsJson: '["Eski konu"]',
  evaluationRubricJson: "[]",
  name: "Best AI Tools",
  purpose: "p",
  audience: "a",
};

function goodOutput(): CarouselOutput {
  return {
    cover: "5 araç tek listede",
    slides: [
      { n: 1, copy: "Birinci araç kısa tanıtım", visual: "kapak" },
      { n: 2, copy: "İkinci araç kısa tanıtım", visual: "" },
      { n: 3, copy: "Kapanış ve kaydet çağrısı", visual: "" },
    ],
    caption: "Listeyi kaydet, sırayla dene.",
    hashtags: ["#aitools"],
  };
}

const INPUT = {
  accountId: "acc-1",
  seriesKey: "best_ai_tools",
  topic: "Yeni mockup araçları",
  expectedSeriesVersion: 3,
  expectedPromptVersion: "v3",
};

beforeEach(() => {
  vi.clearAllMocks();
  gateFn.mockReturnValue({ allowed: true, missing: [], maxUsd: 0.5 });
  accountFindUnique.mockResolvedValue({ id: "acc-1", handle: "grafikcem", isActive: true });
  getProfile.mockResolvedValue({ handle: "grafikcem" });
  identityCtx.mockResolvedValue({ block: "Ses: net.", memoryFactIds: [] });
  getSeriesMock.mockResolvedValue(SERIES);
  getExamplesMock.mockResolvedValue([]);
  dossierFindFirst.mockResolvedValue(null);
  dossierCreate.mockImplementation((a: { data: { id: string } }) => Promise.resolve(a.data));
  runStageMock.mockResolvedValue({ data: goodOutput(), actualCostUsd: 0.02, model: "m" });
  flushMock.mockResolvedValue(undefined);
});

describe("saf yardımcılar", () => {
  it("parseSlideCountRange + normalizeHashtags", () => {
    expect(parseSlideCountRange("6-8")).toEqual({ min: 6, max: 8 });
    expect(parseSlideCountRange("garip")).toBeNull();
    expect(normalizeHashtags(["#AiTools", "tasarim", "#aitools", "bozuk tag!"])).toEqual([
      "#aitools",
      "#tasarim",
    ]);
  });

  it("validateCarouselCandidate: aralık, sıra, kelime limiti, yasak, geçmiş konu, kanıtsız iddia", () => {
    const out = goodOutput();
    out.slides = [
      { n: 1, copy: "bir iki üç dört beş altı yedi sekiz dokuz on onbir oniki onüç ondört onbeş onaltı onyedi onsekiz ondokuz yirmi yirmibir", visual: "" },
      { n: 3, copy: "oyunun kuralları değişti yine", visual: "" },
    ];
    out.caption = "Bu araç tamamen ücretsiz ve %90 hızlı.";
    const issues = validateCarouselCandidate({
      output: out,
      slideCountRange: "3-5",
      bannedRepetitionJson: SERIES.bannedRepetitionJson,
      pastTopicsJson: '["yeni mockup araçları"]',
      topic: "Yeni mockup araçları",
      examples: [],
      hasEvidence: false,
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("slide_count_out_of_range");
    expect(codes).toContain("slide_numbering");
    expect(codes).toContain("slide_word_limit");
    expect(codes).toContain("banned_repetition");
    expect(codes).toContain("past_topic_repeat");
    expect(codes).toContain("unverified_claim");
  });

  it("near_copy fail-closed tespiti", () => {
    const out = goodOutput();
    const canonical = [out.cover, ...out.slides.map((s) => s.copy), out.caption].join("\n");
    const issues = validateCarouselCandidate({
      output: out,
      slideCountRange: "3-5",
      bannedRepetitionJson: "[]",
      pastTopicsJson: "[]",
      topic: "t",
      examples: [canonical],
      hasEvidence: true,
    });
    expect(issues.map((i) => i.code)).toContain("near_copy");
  });
});

describe("generateCarouselEpisode", () => {
  it("kapı kapalı → blocked_gate; SIFIR ağ + SIFIR DB", async () => {
    gateFn.mockReturnValue({ allowed: false, missing: ["OPENROUTER_KEY_ROTATED_AT"], maxUsd: 0 });
    const r = await generateCarouselEpisode(INPUT);
    expect(r).toEqual({ status: "blocked_gate", missing: ["OPENROUTER_KEY_ROTATED_AT"] });
    expect(accountFindUnique).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
    expect(runStageMock).not.toHaveBeenCalled();
    expect(dossierCreate).not.toHaveBeenCalled();
  });

  it("tahmini maliyet per-pass tavana sığmazsa hiç başlamaz", async () => {
    gateFn.mockReturnValue({ allowed: true, missing: [], maxUsd: 0.01 });
    const r = await generateCarouselEpisode(INPUT);
    expect(r.status).toBe("blocked_budget");
    expect(runStageMock).not.toHaveBeenCalled();
  });

  it("pasif/eksik hesap ve generation-ready olmayan profil fail-closed", async () => {
    accountFindUnique.mockResolvedValue(null);
    expect((await generateCarouselEpisode(INPUT)).status).toBe("account_invalid");

    accountFindUnique.mockResolvedValue({ id: "acc-1", handle: "grafikcem", isActive: true });
    const { AccountProfileError } = await import("@/lib/accounts/profileRepository");
    getProfile.mockRejectedValue(new AccountProfileError("profile_incomplete", "x"));
    const r = await generateCarouselEpisode(INPUT);
    expect(r).toMatchObject({ status: "account_invalid", code: "profile_incomplete" });
    expect(runStageMock).not.toHaveBeenCalled();
  });

  it("seri sürüm uyuşmazlığı → series_conflict (LLM yok)", async () => {
    const r = await generateCarouselEpisode({ ...INPUT, expectedSeriesVersion: 2 });
    expect(r.status).toBe("series_conflict");
    expect(runStageMock).not.toHaveBeenCalled();
  });

  it("aynı konu/handoff retry'ı → already_exists, harcama yok", async () => {
    dossierFindFirst.mockResolvedValue({ id: "d-önceki" });
    const r = await generateCarouselEpisode(INPUT);
    expect(r).toEqual({ status: "already_exists", dossierId: "d-önceki" });
    expect(runStageMock).not.toHaveBeenCalled();
  });

  it("araç adlı + kanıt açılmıyor → blocked_evidence, LLM harcaması YOK", async () => {
    verifyMock.mockResolvedValue({ ok: false, reason: "site açılmadı" });
    const r = await generateCarouselEpisode({
      ...INPUT,
      tool: { name: "Araç", url: "https://ornek-arac.example" },
    });
    expect(r).toMatchObject({ status: "blocked_evidence", reason: "site açılmadı" });
    expect(runStageMock).not.toHaveBeenCalled();
    expect(dossierCreate).not.toHaveBeenCalled();
  });

  it("şemadan geçmeyen çıktı persist EDİLMEZ (maliyet raporlanır)", async () => {
    runStageMock.mockResolvedValue({ data: { garbage: true }, actualCostUsd: 0.03, model: "m" });
    const r = await generateCarouselEpisode(INPUT);
    expect(r).toMatchObject({ status: "invalid_output", costUsd: 0.03 });
    expect(dossierCreate).not.toHaveBeenCalled();
    expect(flushMock).toHaveBeenCalledWith(0.03);
  });

  it("near_copy → fail-closed, persist yok", async () => {
    const out = goodOutput();
    getExamplesMock.mockResolvedValue([
      { outputContent: [out.cover, ...out.slides.map((s) => s.copy), out.caption].join("\n") },
    ]);
    const r = await generateCarouselEpisode(INPUT);
    expect(r.status).toBe("invalid_output");
    if (r.status === "invalid_output") {
      expect(r.issues.map((i) => i.code)).toContain("near_copy");
    }
    expect(dossierCreate).not.toHaveBeenCalled();
  });

  it("başarılı üretim: tek create, provenance yok-migration sözleşmesi, onaylı örnekler ≤5 fence'te", async () => {
    getExamplesMock.mockResolvedValue([{ outputContent: "örnek metin" }]);
    const r = await generateCarouselEpisode({ ...INPUT, sourceHandoffId: "h-1" });
    expect(r.status).toBe("created");
    const data = dossierCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.format).toBe("carousel");
    expect(data.pillar).toBe("best_ai_tools");
    expect(JSON.parse(data.slidesJson as string)).toHaveLength(3);
    // Prompt'a örnek fence'i girdi (untrusted).
    const stageOpts = runStageMock.mock.calls[0][0] as { user: string; system: string };
    expect(stageOpts.user).toContain("örnek metin");
    expect(stageOpts.system).toContain("BİREBİR KOPYALAMA");
  });

  it("gözlenen (onaylanmamış) Instagram DNA prompt'a girmez — grounding yalnız identity bloğu + seri", async () => {
    identityCtx.mockResolvedValue({ block: "Caption DNA — emoji: sparse", memoryFactIds: [] });
    await generateCarouselEpisode(INPUT);
    const stageOpts = runStageMock.mock.calls[0][0] as { system: string };
    // identity bloğu (ONAYLI DNA özeti) girer; observation servisi hiç çağrılmaz
    // (mock'ta tanımlı bile değil — import edilseydi test patlar).
    expect(stageOpts.system).toContain("Caption DNA — emoji: sparse");
  });
});
