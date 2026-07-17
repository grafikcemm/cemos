import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Reels dossier motoru (ADR-036 sertleştirilmiş sözleşme):
 *  - ürün kapısı kapalı → sıfır ağ/DB; tahmini toplam tavana sığmazsa başlamaz
 *  - hesap DB + generation-ready (hardcoded VOICE YOK)
 *  - verify HER LLM'den önce; sayfa metni readiness'i flip edemez
 *  - strict Zod: geçmeyen aşama üretimi keser → YARIM DOSSIER YAZILMAZ
 *  - ödenen maliyet trace'te dürüstçe kalır
 */

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    reelDossier: {
      count: vi.fn(() => Promise.resolve(0)),
      create: vi.fn(((args: { data: object }) =>
        Promise.resolve({ id: "rd-1", ...args.data })) as never),
    },
  },
}));
vi.mock("@/lib/services/usageService", () => ({
  usageService: {
    getMonthlySpendByPurpose: vi.fn(() => Promise.resolve(0)),
    recordOpenRouter: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: { create: vi.fn(() => Promise.resolve({ id: "pt" })) },
}));
vi.mock("@/lib/ai/generateGated", () => ({ generateJsonGated: vi.fn() }));
vi.mock("@/lib/verify/verifyWebsite", () => ({ verifyWebsite: vi.fn() }));
vi.mock("@/lib/accounts/profileRepository", async (orig) => {
  const real = await orig<typeof import("@/lib/accounts/profileRepository")>();
  return {
    AccountProfileError: real.AccountProfileError,
    getRuntimeProfile: vi.fn(),
  };
});
vi.mock("@/lib/series/seriesService", () => ({ getSeries: vi.fn() }));

import { prisma } from "@/lib/db/client";
import { usageService } from "@/lib/services/usageService";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { generateJsonGated } from "@/lib/ai/generateGated";
import { verifyWebsite, type VerificationEvidence } from "@/lib/verify/verifyWebsite";
import { getRuntimeProfile } from "@/lib/accounts/profileRepository";
import { getSeries } from "@/lib/series/seriesService";
import { BudgetExceededError } from "@/lib/config/costGate";
import {
  reelDossierFor,
  computeReadiness,
  buildVoiceFromProfile,
  ReelDailyLimitError,
} from "./dossier-generator";

const mockGated = vi.mocked(generateJsonGated);
const mockVerify = vi.mocked(verifyWebsite);
const mockAccount = vi.mocked(prisma.account.findUnique);
const mockProfile = vi.mocked(getRuntimeProfile);

const GATE_KEYS = [
  "OPENROUTER_KEY_ROTATED_AT",
  "INSTAGRAM_GENERATION_ENABLED",
  "INSTAGRAM_GENERATION_LIVE_APPROVED",
  "INSTAGRAM_GENERATION_MAX_USD",
] as const;
const savedEnv: Record<string, string | undefined> = {};

function openGate() {
  process.env.OPENROUTER_KEY_ROTATED_AT = "2026-07-17T00:00:00Z";
  process.env.INSTAGRAM_GENERATION_ENABLED = "true";
  process.env.INSTAGRAM_GENERATION_LIVE_APPROVED = "true";
  process.env.INSTAGRAM_GENERATION_MAX_USD = "0.50";
}

const PROFILE = {
  handle: "grafikcem",
  persona: "pratik operatör",
  concept: "AI + tasarım",
  language: "Turkish",
  toneRules: ["abartısız", "somut"],
} as never;

function evidence(overrides: Partial<VerificationEvidence> = {}): VerificationEvidence {
  return {
    opens: true,
    finalUrl: "https://tool.example.com/",
    redirectChain: [],
    signupRequired: "unknown",
    freeTier: "unknown",
    usageLimits: "unknown",
    exportDownload: "unknown",
    commercialUse: "unknown",
    regionRestricted: "unknown",
    lastUpdated: "unknown",
    checkedAt: new Date(),
    expiry: new Date(Date.now() + 30 * 86_400_000),
    ...overrides,
  };
}

const STAGE_DATA: Record<string, unknown> = {
  konsept: { painPoint: "p", objective: "saves", whyNow: "w", pillar: "arac_demo" },
  hook: { hook: "5 araç tek video", cover: "kapak", cta: "kaydet" },
  senaryo: {
    script: "senaryo",
    timeline: [{ t: "0-3sn", action: "hook" }],
    scenePlan: [{ scene: 1, visual: "ekran", duration: "3sn" }],
    screenRecordingPlan: [{ step: 1, whatToClick: "buton", capture: "akış" }],
    voiceover: "vo",
    onScreenCopy: ["kısa metin"],
  },
  caption: { caption: "caption", hashtagGroup: ["#ai"], assetChecklist: [], productionEstimate: "1s", risk: "" },
};

function llmOkByStage() {
  mockGated.mockImplementation((opts: { meta?: Record<string, unknown> }) => {
    const stage = String(opts.meta?.stage ?? "");
    return Promise.resolve({
      data: STAGE_DATA[stage] ?? {},
      model: "m",
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 0.01,
      actualCostUsd: 0.01,
    } as never);
  });
}

const INPUT = { accountId: "acc-1", topic: "AI mockup akışı" };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of GATE_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  openGate();
  mockAccount.mockResolvedValue({ id: "acc-1", handle: "grafikcem", isActive: true } as never);
  mockProfile.mockResolvedValue(PROFILE);
  vi.mocked(usageService.getMonthlySpendByPurpose).mockResolvedValue(0);
  vi.mocked(prisma.reelDossier.count).mockResolvedValue(0 as never);
  llmOkByStage();
});

afterEach(() => {
  for (const k of GATE_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("computeReadiness — KOD kararı (LLM flip edemez)", () => {
  it("araç yok → ready; kanıt yok/kapalı → not_ready; taze → ready; expiry → needs_verify", () => {
    expect(computeReadiness({ toolNamed: false, evidence: null })).toBe("ready");
    expect(computeReadiness({ toolNamed: true, evidence: null })).toBe("not_ready");
    expect(computeReadiness({ toolNamed: true, evidence: evidence({ opens: false }) })).toBe("not_ready");
    expect(computeReadiness({ toolNamed: true, evidence: evidence() })).toBe("ready");
    expect(
      computeReadiness({ toolNamed: true, evidence: evidence({ expiry: new Date(Date.now() - 86_400_000) }) })
    ).toBe("needs_verify");
  });
});

describe("buildVoiceFromProfile — hardcoded persona yok", () => {
  it("runtime profilden ses üretir; 'grafikcem' sabiti profilden gelir", () => {
    const v = buildVoiceFromProfile(PROFILE);
    expect(v).toContain("@grafikcem");
    expect(v).toContain("pratik operatör");
    expect(v).toContain("abartısız");
  });
});

describe("reelDossierFor — kapı + hesap + bütçe", () => {
  it("kapı kapalı → blocked_gate; SIFIR ağ + SIFIR DB", async () => {
    delete process.env.INSTAGRAM_GENERATION_ENABLED;
    const r = await reelDossierFor(INPUT);
    expect(r).toMatchObject({ status: "blocked_gate" });
    expect(mockAccount).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockGated).not.toHaveBeenCalled();
    expect(prisma.reelDossier.create).not.toHaveBeenCalled();
  });

  it("tahmini 4-aşama toplamı per-pass tavana sığmazsa HİÇ başlamaz", async () => {
    process.env.INSTAGRAM_GENERATION_MAX_USD = "0.10"; // < 0.24 tahmin
    const r = await reelDossierFor(INPUT);
    expect(r.status).toBe("blocked_budget");
    expect(mockGated).not.toHaveBeenCalled();
  });

  it("hesap yok/pasif veya generation-ready değil → account_invalid", async () => {
    mockAccount.mockResolvedValue(null as never);
    expect((await reelDossierFor(INPUT)).status).toBe("account_invalid");

    mockAccount.mockResolvedValue({ id: "acc-1", handle: "grafikcem", isActive: true } as never);
    const { AccountProfileError } = await import("@/lib/accounts/profileRepository");
    mockProfile.mockRejectedValue(new AccountProfileError("profile_incomplete", "x"));
    const r = await reelDossierFor(INPUT);
    expect(r).toMatchObject({ status: "account_invalid", code: "profile_incomplete" });
  });

  it("aylık bütçe/günlük limit LLM'den ÖNCE keser (mevcut sözleşme)", async () => {
    vi.mocked(usageService.getMonthlySpendByPurpose).mockResolvedValue(999);
    await expect(reelDossierFor(INPUT)).rejects.toThrow(BudgetExceededError);
    expect(mockGated).not.toHaveBeenCalled();

    vi.mocked(usageService.getMonthlySpendByPurpose).mockResolvedValue(0);
    vi.mocked(prisma.reelDossier.count).mockResolvedValue(99 as never);
    await expect(reelDossierFor(INPUT)).rejects.toThrow(ReelDailyLimitError);
  });

  it("seriesKey verilirse seri aynı hesapta aktif olmalı", async () => {
    vi.mocked(getSeries).mockResolvedValue(null as never);
    const r = await reelDossierFor({ ...INPUT, seriesKey: "best_ai_tools" });
    expect(r.status).toBe("series_not_found");
    expect(mockGated).not.toHaveBeenCalled();
  });
});

describe("reelDossierFor — evidence gate + atomik yazım", () => {
  it("araç adlıysa verify HER LLM aşamasından ÖNCE koşar", async () => {
    mockVerify.mockResolvedValue({ ok: true, evidence: evidence(), verificationId: "wv-1" });
    await reelDossierFor({
      ...INPUT,
      primaryTool: { name: "Tool", url: "https://tool.example.com" },
    });
    expect(mockVerify.mock.invocationCallOrder[0]).toBeLessThan(mockGated.mock.invocationCallOrder[0]);
  });

  it("adversarial sayfa metni readiness'i FLIP EDEMEZ: verify fail → not_ready", async () => {
    mockVerify.mockResolvedValue({ ok: false, reason: "fetch_failed" });
    const r = await reelDossierFor({
      ...INPUT,
      primaryTool: { name: "Sahte", url: "https://fake.example.com" },
    });
    expect(r.status).toBe("created");
    if (r.status === "created") {
      expect(r.finalReadiness).toBe("not_ready");
      expect(r.verified).toBe(false);
    }
    const data = vi.mocked(prisma.reelDossier.create).mock.calls[0][0].data as {
      finalReadiness: string;
    };
    expect(data.finalReadiness).toBe("not_ready");
  });

  it("4 aşama geçince TEK create: bütün alanlar + contentHash + profil sesi", async () => {
    const r = await reelDossierFor(INPUT);
    expect(r.status).toBe("created");
    expect(vi.mocked(prisma.reelDossier.create)).toHaveBeenCalledTimes(1);
    const data = vi.mocked(prisma.reelDossier.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.hook).toBe("5 araç tek video");
    expect(data.script).toBe("senaryo");
    expect(data.caption).toBe("caption");
    // VOICE runtime profilden (hardcoded değil).
    const firstCall = mockGated.mock.calls[0][0] as { system: string };
    expect(firstCall.system).toContain("@grafikcem");
    expect(firstCall.system).toContain("pratik operatör");
    if (r.status === "created") expect(r.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("aşama şemadan geçmezse üretim KESİLİR → yarım dossier YOK, maliyet trace'te", async () => {
    mockGated.mockImplementation((opts: { meta?: Record<string, unknown> }) => {
      const stage = String(opts.meta?.stage ?? "");
      if (stage === "senaryo") {
        return Promise.resolve({ data: { garbage: true }, model: "m", actualCostUsd: 0.02 } as never);
      }
      return Promise.resolve({ data: STAGE_DATA[stage], model: "m", actualCostUsd: 0.01 } as never);
    });
    const r = await reelDossierFor(INPUT);
    expect(r).toMatchObject({ status: "failed", failedStage: "senaryo" });
    if (r.status === "failed") expect(r.costUsd).toBeCloseTo(0.04, 5);
    expect(prisma.reelDossier.create).not.toHaveBeenCalled();
    // Ödenen maliyet PipelineTrace'e flush edildi (dürüst kayıt).
    expect(pipelineTraceRepo.create).toHaveBeenCalled();
  });

  it("aşama LLM hatası da yarım dossier bırakmaz", async () => {
    mockGated.mockImplementation((opts: { meta?: Record<string, unknown> }) => {
      const stage = String(opts.meta?.stage ?? "");
      if (stage === "hook") return Promise.reject(new Error("model down"));
      return Promise.resolve({ data: STAGE_DATA[stage], model: "m", actualCostUsd: 0.01 } as never);
    });
    const r = await reelDossierFor(INPUT);
    expect(r).toMatchObject({ status: "failed", failedStage: "hook" });
    expect(prisma.reelDossier.create).not.toHaveBeenCalled();
  });
});
