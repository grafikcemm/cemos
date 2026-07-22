import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Re-verification lifecycle + production-state assembly (ADR-038 §C/§D):
 *  - ownership/concurrency fail-closed; yarışan sonuç mevcut durumu ezemez
 *  - URL server-side; başarı atomic snapshot+dossier update; başarısızlık
 *    hiçbir alanı değiştirmez (eski kanıt korunur)
 *  - SIFIR LLM; trace bounded/redacted typed kod taşır
 */

const txMock = {
  $queryRaw: vi.fn(() => Promise.resolve([])),
  reelDossier: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    reelDossier: { findUnique: vi.fn(), update: vi.fn() },
    websiteVerification: { findUnique: vi.fn(() => Promise.resolve(null)) },
    reelPlanSlot: { findMany: vi.fn(() => Promise.resolve([])) },
    seriesProfile: { findFirst: vi.fn(() => Promise.resolve(null)) },
    trainingExample: { findFirst: vi.fn(() => Promise.resolve(null)) },
  },
}));
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: {
    create: vi.fn(() => Promise.resolve({ id: "pt-1" })),
    listBySubject: vi.fn(() => Promise.resolve([])),
  },
}));

import { prisma } from "@/lib/db/client";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { reverifyDossier, getDossierProductionState } from "./dossierProductionService";
import { serializeAlternatives, parseAlternatives, type DossierAlternative } from "./alternatives";
import type { VerificationEvidence } from "@/lib/verify/verifyWebsite";

const NOW = Date.parse("2026-07-18T12:00:00Z");
const UPDATED_AT = new Date("2026-07-18T09:00:00.000Z");
const TOOL_URL = "https://tool.example.com/";

function evidence(overrides: Partial<VerificationEvidence> = {}): VerificationEvidence {
  return {
    opens: true,
    finalUrl: TOOL_URL,
    redirectChain: [],
    signupRequired: "unknown",
    freeTier: "unknown",
    usageLimits: "unknown",
    exportDownload: "unknown",
    commercialUse: "unknown",
    regionRestricted: "unknown",
    lastUpdated: "unknown",
    checkedAt: new Date(NOW),
    expiry: new Date(NOW + 30 * 86_400_000),
    ...overrides,
  };
}

function dossier(overrides: Record<string, unknown> = {}) {
  return {
    id: "rd-1",
    accountId: "acc-1",
    title: "Araç tanıtımı",
    pillar: "arac_demo",
    format: "reel",
    painPoint: "",
    objective: "saves",
    whyNow: "",
    primaryToolJson: JSON.stringify({ name: "Tool", url: TOOL_URL }),
    verificationId: "wv-old",
    verificationEvidenceJson: JSON.stringify(evidence()),
    alternativesJson: "[]",
    hook: "hook",
    script: "script",
    timelineJson: JSON.stringify([{ t: "0-3sn", action: "hook" }]),
    scenePlanJson: JSON.stringify([{ scene: 1, visual: "ekran" }]),
    screenRecordingPlanJson: JSON.stringify([{ step: 1, whatToClick: "buton" }]),
    voiceover: "vo",
    onScreenCopyJson: "[]",
    cover: "kapak",
    cta: "kaydet",
    caption: "caption",
    hashtagGroupJson: "[]",
    slidesJson: "[]",
    assetChecklistJson: "[]",
    productionEstimate: "",
    expiry: new Date(NOW + 30 * 86_400_000),
    risk: "",
    finalReadiness: "ready",
    costUsd: 0.1,
    createdAt: new Date("2026-07-18T08:00:00.000Z"),
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

const mockRootFind = vi.mocked(prisma.reelDossier.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
  txMock.$queryRaw.mockResolvedValue([]);
});

const BASE_INPUT = {
  dossierId: "rd-1",
  accountId: "acc-1",
  expectedUpdatedAt: UPDATED_AT.toISOString(),
  nowMs: NOW,
};

describe("reverifyDossier — sözleşme kontrolleri", () => {
  it("account mismatch fail-closed; ağ hiç çağrılmaz", async () => {
    mockRootFind.mockResolvedValue(dossier({ accountId: "OTHER" }) as never);
    const verifyImpl = vi.fn();
    const r = await reverifyDossier({ ...BASE_INPUT, verifyImpl });
    expect(r).toMatchObject({ ok: false, code: "account_mismatch" });
    expect(verifyImpl).not.toHaveBeenCalled();
  });

  it("stale expectedUpdatedAt → 409-sınıfı stale; ağ çağrılmaz", async () => {
    mockRootFind.mockResolvedValue(dossier() as never);
    const verifyImpl = vi.fn();
    const r = await reverifyDossier({
      ...BASE_INPUT,
      expectedUpdatedAt: "2026-07-18T08:59:59.000Z",
      verifyImpl,
    });
    expect(r).toMatchObject({ ok: false, code: "stale" });
    expect(verifyImpl).not.toHaveBeenCalled();
  });

  it("araç adsız dossier → no_tool (istemci URL sağlayamaz)", async () => {
    mockRootFind.mockResolvedValue(dossier({ primaryToolJson: "{}" }) as never);
    const r = await reverifyDossier({ ...BASE_INPUT, verifyImpl: vi.fn() });
    expect(r).toMatchObject({ ok: false, code: "no_tool" });
  });
});

describe("reverifyDossier — başarı ve başarısızlık", () => {
  it("başarılı primary: URL SERVER-side, force-refresh default, atomic dossier update", async () => {
    const d = dossier();
    mockRootFind.mockResolvedValue(d as never);
    txMock.reelDossier.findUnique.mockResolvedValue(d as never);
    txMock.reelDossier.update.mockResolvedValue(
      dossier({ verificationId: "wv-new", updatedAt: new Date(NOW) }) as never
    );
    const verifyImpl = vi.fn(() =>
      Promise.resolve({ ok: true as const, evidence: evidence(), verificationId: "wv-new" })
    );
    const r = await reverifyDossier({ ...BASE_INPUT, verifyImpl });

    expect(verifyImpl).toHaveBeenCalledWith(TOOL_URL, { forceRefresh: true });
    expect(txMock.reelDossier.update).toHaveBeenCalledTimes(1);
    const data = txMock.reelDossier.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.verificationId).toBe("wv-new");
    expect(data.finalReadiness).toBe("ready");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.outcome.status).toBe("verified");
      expect(r.outcome.verificationId).toBe("wv-new");
    }
  });

  it("başarısız doğrulama: HİÇBİR alan yazılmaz — eski kanıt/audit korunur", async () => {
    const d = dossier();
    mockRootFind.mockResolvedValue(d as never);
    txMock.reelDossier.findUnique.mockResolvedValue(d as never);
    const verifyImpl = vi.fn(() =>
      Promise.resolve({ ok: false as const, code: "timeout" as const, reason: "Site zaman aşımında yanıt vermedi." })
    );
    const r = await reverifyDossier({ ...BASE_INPUT, verifyImpl });

    expect(txMock.reelDossier.update).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.outcome.status).toBe("verification_failed");
      expect(r.outcome.code).toBe("timeout");
    }
    // Bounded/redacted iz: typed kod, URL yok.
    expect(pipelineTraceRepo.create).toHaveBeenCalledTimes(1);
    const trace = vi.mocked(pipelineTraceRepo.create).mock.calls[0][0];
    expect(trace.stages[0].blockedReason).toBe("timeout");
    expect(JSON.stringify(trace)).not.toContain(TOOL_URL);
  });

  it("yarış: tx içinde updatedAt değişmişse geç kalan sonuç EZMEZ → stale", async () => {
    const d = dossier();
    mockRootFind.mockResolvedValue(d as never);
    txMock.reelDossier.findUnique.mockResolvedValue(
      dossier({ updatedAt: new Date(NOW) }) as never // bu arada değişti
    );
    const verifyImpl = vi.fn(() =>
      Promise.resolve({ ok: true as const, evidence: evidence(), verificationId: "wv-late" })
    );
    const r = await reverifyDossier({ ...BASE_INPUT, verifyImpl });
    expect(r).toMatchObject({ ok: false, code: "stale" });
    expect(txMock.reelDossier.update).not.toHaveBeenCalled();
  });

  it("alternative hedefi: yalnız zarf girdisi güncellenir, primary kanıta DOKUNULMAZ", async () => {
    const alt: DossierAlternative = {
      id: "alt-1",
      name: "Yedek",
      submittedUrl: "https://yedek.example.com/",
      finalUrl: null,
      verificationId: null,
      opens: null,
      checkedAt: null,
      expiry: null,
      status: "active",
      archivedAt: null,
      createdAt: new Date(NOW).toISOString(),
    };
    const d = dossier({ alternativesJson: serializeAlternatives([alt]) });
    mockRootFind.mockResolvedValue(d as never);
    txMock.reelDossier.findUnique.mockResolvedValue(d as never);
    txMock.reelDossier.update.mockResolvedValue(dossier({ updatedAt: new Date(NOW) }) as never);
    const verifyImpl = vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        evidence: evidence({ finalUrl: "https://yedek.example.com/" }),
        verificationId: "wv-alt",
      })
    );
    const r = await reverifyDossier({
      ...BASE_INPUT,
      target: { kind: "alternative", alternativeId: "alt-1" },
      verifyImpl,
    });

    expect(verifyImpl).toHaveBeenCalledWith("https://yedek.example.com/", { forceRefresh: true });
    const data = txMock.reelDossier.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.verificationId).toBeUndefined(); // primary alanına dokunulmadı
    expect(data.verificationEvidenceJson).toBeUndefined();
    const updated = parseAlternatives(String(data.alternativesJson));
    expect(updated.alternatives[0].verificationId).toBe("wv-alt");
    expect(updated.alternatives[0].opens).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("aktif olmayan/bilinmeyen alternatif → alternative_not_found", async () => {
    mockRootFind.mockResolvedValue(dossier() as never);
    const r = await reverifyDossier({
      ...BASE_INPUT,
      target: { kind: "alternative", alternativeId: "yok" },
      verifyImpl: vi.fn(),
    });
    expect(r).toMatchObject({ ok: false, code: "alternative_not_found" });
  });
});

describe("getDossierProductionState — gerçek satırdan türetim", () => {
  it("verificationId satırı DB'de yoksa evidence=missing (kopya JSON yetmez)", async () => {
    vi.mocked(prisma.websiteVerification.findUnique).mockResolvedValue(null as never);
    const s = await getDossierProductionState(dossier() as never, NOW);
    expect(s.layers.evidence.state).toBe("missing");
    expect(s.layers.evidence.reasons).toContain("verification_row_not_found");
  });

  it("gerçek taze satır varsa ready; onay yoksa overall awaiting/attached'a göre", async () => {
    vi.mocked(prisma.websiteVerification.findUnique).mockResolvedValue({
      id: "wv-old",
      url: TOOL_URL,
      finalUrl: TOOL_URL,
      opens: true,
      redirectChain: "[]",
      evidenceJson: JSON.stringify(evidence()),
      checkedAt: new Date(NOW - 3600_000),
      expiry: new Date(NOW + 10 * 86_400_000),
      createdAt: new Date(NOW - 3600_000),
    } as never);
    const s = await getDossierProductionState(dossier() as never, NOW);
    expect(s.layers.evidence.state).toBe("ready");
    expect(s.layers.approval.approved).toBe(false);
    expect(s.overall).toBe("awaiting_human_approval");
    expect(s.productionReady).toBe(false);
  });
});
