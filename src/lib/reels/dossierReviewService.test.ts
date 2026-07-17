import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Review/approve governance (ADR-036 §F/§G):
 *  - optimistic concurrency (stale), sahiplik, verification alanları düzenlenemez
 *  - onay: server readiness + kanıt tazeliği + seri promptVersion yeniden kontrol
 *  - advisory-lock idempotency: çift onay (concurrent dahil) duplicate üretmez
 *  - operatör edit'i → FeedbackEvent (best-effort) + label "edited"
 *  - embedding hatası approval'ı BOZMAZ
 */

const dossierFindUnique = vi.fn();
const dossierUpdate = vi.fn();
const seriesFindFirst = vi.fn();
const seriesUpdate = vi.fn();
const teFindFirst = vi.fn();
const teCreate = vi.fn();
const txQueryRaw = vi.fn();
const feedbackCreate = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    reelDossier: {
      findUnique: (a: unknown) => dossierFindUnique(a),
      update: (a: unknown) => dossierUpdate(a),
    },
    seriesProfile: {
      findFirst: (a: unknown) => seriesFindFirst(a),
    },
    trainingExample: {
      findFirst: (a: unknown) => teFindFirst(a),
    },
    feedbackEvent: { create: (a: unknown) => feedbackCreate(a) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

const listBySubject = vi.fn();
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: { listBySubject: (...a: unknown[]) => listBySubject(...a) },
}));

const embedMock = vi.fn();
vi.mock("@/lib/growth-engine/vector-memory", () => ({
  embedTrainingExample: (id: string) => embedMock(id),
}));

import {
  approveDossier,
  editDossier,
  extractProvenance,
  currentContentHash,
} from "./dossierReviewService";
import type { ReelDossier } from "@/generated/prisma/client";

const NOW = new Date("2026-07-18T10:00:00.000Z");

function dossier(overrides: Partial<ReelDossier> = {}): ReelDossier {
  return {
    id: "d-1",
    accountId: "acc-1",
    title: "Yeni mockup araçları",
    pillar: "best_ai_tools",
    format: "carousel",
    painPoint: "",
    objective: "save",
    whyNow: "",
    primaryToolJson: "{}",
    verificationId: null,
    verificationEvidenceJson: "{}",
    alternativesJson: "[]",
    hook: "",
    script: "",
    timelineJson: "[]",
    scenePlanJson: "[]",
    screenRecordingPlanJson: "[]",
    voiceover: "",
    onScreenCopyJson: "[]",
    cover: "5 araç tek listede",
    cta: "",
    caption: "Listeyi kaydet.",
    hashtagGroupJson: '["#ai"]',
    slidesJson: JSON.stringify([
      { n: 1, copy: "Birinci araç", visual: "" },
      { n: 2, copy: "İkinci araç", visual: "" },
      { n: 3, copy: "Kapanış", visual: "" },
    ]),
    assetChecklistJson: "[]",
    productionEstimate: "",
    expiry: null,
    risk: "",
    finalReadiness: "ready",
    costUsd: 0.02,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as ReelDossier;
}

function provenanceTrace(overrides: Record<string, unknown> = {}) {
  return [
    {
      stages: [
        { stage: "carousel", role: "premiumCreative", model: "model-x", ok: true, failOpenUsed: false, ms: 10, costUsd: 0.02 },
        {
          stage: "provenance",
          role: "none",
          model: "",
          ok: true,
          failOpenUsed: false,
          ms: 0,
          costUsd: 0,
          seriesKey: "best_ai_tools",
          seriesVersion: 3,
          promptVersion: "v3",
          contentHash: "orijinal-hash",
          policyVersion: "3B-1",
          ...overrides,
        },
      ],
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  dossierFindUnique.mockResolvedValue(dossier());
  dossierUpdate.mockImplementation((a: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...dossier(), ...a.data, updatedAt: new Date("2026-07-18T10:05:00.000Z") })
  );
  listBySubject.mockResolvedValue(provenanceTrace());
  seriesFindFirst.mockResolvedValue({
    id: "sp-1",
    promptVersion: "v3",
    pastTopicsJson: "[]",
  });
  teFindFirst.mockResolvedValue(null);
  teCreate.mockResolvedValue({ id: "te-1" });
  txQueryRaw.mockResolvedValue([{ pg_advisory_xact_lock: null }]);
  seriesUpdate.mockResolvedValue({});
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: (...a: unknown[]) => txQueryRaw(...a),
      trainingExample: {
        findFirst: (a: unknown) => teFindFirst(a),
        create: (a: unknown) => teCreate(a),
      },
      seriesProfile: { update: (a: unknown) => seriesUpdate(a) },
    })
  );
  embedMock.mockResolvedValue(undefined);
  feedbackCreate.mockResolvedValue({});
});

const EXPECTED = NOW.toISOString();

describe("editDossier", () => {
  it("stale expectedUpdatedAt → stale (409 yolu), yazma yok", async () => {
    const r = await editDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: "2026-07-18T09:00:00.000Z",
      carousel: { cover: "yeni" },
    });
    expect(r).toMatchObject({ ok: false, code: "stale" });
    expect(dossierUpdate).not.toHaveBeenCalled();
  });

  it("sahiplik: başka hesap → account_mismatch", async () => {
    const r = await editDossier({
      dossierId: "d-1",
      accountId: "baska",
      expectedUpdatedAt: EXPECTED,
      carousel: { cover: "yeni" },
    });
    expect(r).toMatchObject({ ok: false, code: "account_mismatch" });
  });

  it("slaytlar server-canonical yeniden numaralanır; hashtag normalize; readiness sunucudan", async () => {
    const r = await editDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
      carousel: {
        slides: [{ copy: "Tek slayt" }, { copy: "İkinci" }, { copy: "Üçüncü" }],
        hashtags: ["AiTools", "#tasarim"],
      },
    });
    expect(r.ok).toBe(true);
    const data = dossierUpdate.mock.calls[0][0].data as Record<string, string>;
    expect(JSON.parse(data.slidesJson).map((s: { n: number }) => s.n)).toEqual([1, 2, 3]);
    expect(JSON.parse(data.hashtagGroupJson)).toEqual(["#aitools", "#tasarim"]);
    if (r.ok) expect(r.readiness.status).toBe("ready_for_review");
  });

  it("verification/evidence alanları edit yüzeyinde YOK (tip + davranış)", async () => {
    await editDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
      carousel: { cover: "yeni kapak" },
    });
    const data = dossierUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.verificationEvidenceJson).toBeUndefined();
    expect(data.verificationId).toBeUndefined();
    expect(data.finalReadiness).toBeUndefined();
  });
});

describe("approveDossier", () => {
  it("başarılı onay: advisory lock + TrainingExample(seriesKey) + pastTopics append (version bump YOK)", async () => {
    const r = await approveDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
    });
    expect(r).toMatchObject({ ok: true, alreadyApproved: false, operatorEdited: true });
    // advisory lock çağrıldı
    expect(txQueryRaw).toHaveBeenCalled();
    const te = teCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(te.platform).toBe("instagram");
    expect(te.seriesKey).toBe("best_ai_tools");
    const metrics = JSON.parse(te.metricsJson as string);
    expect(metrics.dossierId).toBe("d-1");
    expect(metrics.model).toBe("model-x");
    expect(metrics.operatorEdited).toBe(true);
    // pastTopics güncellendi; version bump YOK
    const su = seriesUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(JSON.parse(su.pastTopicsJson as string)).toContain("Yeni mockup araçları");
    expect(su.version).toBeUndefined();
  });

  it("operatör edit'i YOKSA label positive + FeedbackEvent yazılmaz", async () => {
    // provenance hash'i güncel içerik hash'iyle eşleşsin
    const d = dossier();
    const hash = currentContentHash(d);
    listBySubject.mockResolvedValue(provenanceTrace({ contentHash: hash }));
    const r = await approveDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
    });
    expect(r).toMatchObject({ ok: true, operatorEdited: false });
    const te = teCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(te.label).toBe("positive");
    expect(feedbackCreate).not.toHaveBeenCalled();
  });

  it("operatör edit'i varsa label edited + FeedbackEvent (editDistance dürüst null)", async () => {
    const r = await approveDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
    });
    expect(r).toMatchObject({ ok: true, operatorEdited: true });
    const te = teCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(te.label).toBe("edited");
    const fe = feedbackCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(fe.editDistance).toBeNull();
    expect(fe.platform).toBe("instagram");
  });

  it("idempotent: zaten onaylı → alreadyApproved, ikinci TrainingExample YOK", async () => {
    teFindFirst.mockResolvedValue({ id: "te-eski" });
    const r = await approveDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
    });
    expect(r).toMatchObject({ ok: true, alreadyApproved: true, trainingExampleId: "te-eski" });
    expect(teCreate).not.toHaveBeenCalled();
    expect(seriesUpdate).not.toHaveBeenCalled();
  });

  it("concurrent çift onay: lock içindeki ikinci kontrol duplicate'i önler", async () => {
    // İlk findFirst (lock içinde) null, ikinci çağrıda mevcut kayıt — iki
    // paralel onayın serialize edilmiş hâlini simüle eder.
    teFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "te-1" });
    const [a, b] = await Promise.all([
      approveDossier({ dossierId: "d-1", accountId: "acc-1", expectedUpdatedAt: EXPECTED }),
      approveDossier({ dossierId: "d-1", accountId: "acc-1", expectedUpdatedAt: EXPECTED }),
    ]);
    const already = [a, b].filter((r) => r.ok && r.alreadyApproved).length;
    const created = [a, b].filter((r) => r.ok && !r.alreadyApproved).length;
    expect(created).toBe(1);
    expect(already).toBe(1);
    expect(teCreate).toHaveBeenCalledTimes(1);
  });

  it("creative not-ready → onay reddi (server hesaplar, istemci readiness'i yok)", async () => {
    dossierFindUnique.mockResolvedValue(dossier({ caption: "" }));
    const r = await approveDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
    });
    expect(r).toMatchObject({ ok: false, code: "not_ready" });
    expect(teCreate).not.toHaveBeenCalled();
  });

  it("araçlı + kanıt bayat/yok → evidence_stale reddi", async () => {
    dossierFindUnique.mockResolvedValue(
      dossier({
        primaryToolJson: JSON.stringify({ name: "Araç", url: "https://x.example" }),
        verificationEvidenceJson: JSON.stringify({
          opens: true,
          expiry: "2026-01-01T00:00:00.000Z", // geçmiş
        }),
      })
    );
    const r = await approveDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
    });
    expect(r).toMatchObject({ ok: false, code: "evidence_stale" });
  });

  it("seri promptVersion değişmiş → series_version_changed reddi", async () => {
    seriesFindFirst.mockResolvedValue({ id: "sp-1", promptVersion: "v9", pastTopicsJson: "[]" });
    const r = await approveDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
    });
    expect(r).toMatchObject({ ok: false, code: "series_version_changed" });
  });

  it("embedding hatası approval'ı BOZMAZ", async () => {
    embedMock.mockRejectedValue(new Error("embed down"));
    const r = await approveDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: EXPECTED,
    });
    expect(r.ok).toBe(true);
  });

  it("stale sürümle onay → 409 yolu", async () => {
    const r = await approveDossier({
      dossierId: "d-1",
      accountId: "acc-1",
      expectedUpdatedAt: "2026-07-18T09:00:00.000Z",
    });
    expect(r).toMatchObject({ ok: false, code: "stale" });
  });
});

describe("extractProvenance", () => {
  it("provenance stage'i + ilk LLM modelini çıkarır", () => {
    const p = extractProvenance(provenanceTrace()[0].stages as never);
    expect(p).toMatchObject({
      seriesKey: "best_ai_tools",
      seriesVersion: 3,
      promptVersion: "v3",
      model: "model-x",
    });
  });
});
