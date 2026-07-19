import { describe, it, expect, vi, beforeEach } from "vitest";

const proposeFactMock = vi.fn();
vi.mock("./memoryFactService", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./memoryFactService")>();
  return { ...orig, proposeFact: (...args: unknown[]) => proposeFactMock(...args) };
});

const feFindMany = vi.fn();
const feFindUnique = vi.fn();
const feUpdate = vi.fn();
const evFindMany = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: {
    feedbackEvent: {
      findMany: (...a: unknown[]) => feFindMany(...a),
      findUnique: (...a: unknown[]) => feFindUnique(...a),
      update: (...a: unknown[]) => feUpdate(...a),
    },
    memoryEvidence: { findMany: (...a: unknown[]) => evFindMany(...a) },
  },
}));

import {
  CANONICAL_FEEDBACK_RULES,
  deriveMemorySignal,
  extractReasonText,
  isMechanicalReason,
  ingestFeedbackSignal,
  reconcileFeedbackSignals,
  setFeedbackSignalNeutralized,
  type FeedbackEventLike,
} from "./signalBridge";

function ev(overrides: Partial<FeedbackEventLike> = {}): FeedbackEventLike {
  return {
    id: "fe-1",
    feedbackType: "approved",
    reason: "",
    editedContent: "",
    originalContent: "Orijinal taslak metni",
    editDistance: null,
    createdAt: new Date("2026-07-16T08:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  proposeFactMock.mockResolvedValue({ outcome: "created", factId: "f-1", supersedesId: null, reviewReady: false });
});

describe("deriveMemorySignal — deterministik eşleme (ADR-029)", () => {
  it("tanımlı tag SABİT canonical kural adayına gider (serbest yorum uydurulmaz)", () => {
    for (const tag of ["not_my_tone", "hook_weak", "too_ai", "make_stronger", "make_clearer"]) {
      const s = deriveMemorySignal(ev({ feedbackType: tag }));
      expect(s, tag).not.toBeNull();
      expect(s!.kind).toBe("canonical_rule");
      expect(s!.proposal.statement).toBe(CANONICAL_FEEDBACK_RULES[tag].statement);
      expect(s!.proposal.type).toBe("preference");
    }
  });

  it("generic/default/mekanik reason ÖĞRENİLMEZ", () => {
    expect(isMechanicalReason("Daily Queue editor feedback")).toBe(true);
    expect(isMechanicalReason("Manuel paylaşıldı (sabah akışı)")).toBe(true);
    expect(isMechanicalReason("Editor action: approved")).toBe(true);
    expect(isMechanicalReason("")).toBe(true);
    expect(deriveMemorySignal(ev({ feedbackType: "approved", reason: "Daily Queue editor feedback" }))).toBeNull();
    expect(deriveMemorySignal(ev({ feedbackType: "rejected", reason: "Editor action: rejected" }))).toBeNull();
  });

  it("reason'sız approved/rejected identity kuralı ÜRETMEZ (yalnız metrik)", () => {
    expect(deriveMemorySignal(ev({ feedbackType: "approved" }))).toBeNull();
    expect(deriveMemorySignal(ev({ feedbackType: "rejected" }))).toBeNull();
  });

  it("editDistance tek başına kural ÜRETMEZ (edited + mekanik reason → null)", () => {
    const s = deriveMemorySignal(
      ev({ feedbackType: "edited", reason: "Manuel paylaşıldı (sabah akışı)", editDistance: 0.62 })
    );
    expect(s).toBeNull();
  });

  it("GERÇEK kullanıcı reason'ı operatörün kendi sözleri olarak statement olur", () => {
    const reason = "Cümleler çok uzun, kısa ve vurucu yaz";
    const s = deriveMemorySignal(ev({ feedbackType: "rejected", reason }));
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("explicit_reason");
    expect(s!.proposal.statement).toBe(reason); // verbatim — icat edilmiş yorum yok
    expect(s!.direction).toBe("negative");
  });

  it("çok kısa serbest metin normalize edilemez → kural yok", () => {
    expect(deriveMemorySignal(ev({ feedbackType: "rejected", reason: "kötü" }))).toBeNull();
  });

  it("engagement_high/low performans alanıdır → identity sinyali YOK", () => {
    expect(deriveMemorySignal(ev({ feedbackType: "engagement_high" }))).toBeNull();
    expect(deriveMemorySignal(ev({ feedbackType: "engagement_low" }))).toBeNull();
  });

  it("reason JSON'u {text, editDistance} çözülür", () => {
    expect(extractReasonText(JSON.stringify({ text: "Ton fazla resmi", editDistance: 0.4 }))).toBe("Ton fazla resmi");
    expect(extractReasonText("düz metin")).toBe("düz metin");
  });
});

describe("ingestFeedbackSignal", () => {
  it("kanıt FeedbackEvent id'sine bağlanır; createdBy=feedback_pipeline (otomatik aktifleşme imkânsız)", async () => {
    const r = await ingestFeedbackSignal(ev({ feedbackType: "not_my_tone", id: "fe-42" }), "grafikcem");
    expect(r.ingested).toBe(true);
    const input = proposeFactMock.mock.calls[0][0] as {
      createdBy: string;
      evidence: { sourceType: string; sourceId: string; signalType: string };
    };
    expect(input.createdBy).toBe("feedback_pipeline");
    expect(input.evidence.sourceType).toBe("feedback_event");
    expect(input.evidence.sourceId).toBe("fe-42");
    expect(input.evidence.signalType).toBe("not_my_tone");
  });

  it("sinyalsiz event hiçbir şey yazmaz", async () => {
    const r = await ingestFeedbackSignal(ev({ feedbackType: "approved" }), "grafikcem");
    expect(r).toEqual({ ingested: false, reason: "no_signal" });
    expect(proposeFactMock).not.toHaveBeenCalled();
  });
});

describe("reconcileFeedbackSignals (LLM'siz, idempotent)", () => {
  const rows = [
    { id: "fe-a", feedbackType: "not_my_tone", reason: "", editedContent: "", originalContent: "x", editDistance: null, createdAt: new Date(), account: { handle: "grafikcem" } },
    { id: "fe-b", feedbackType: "approved", reason: "", editedContent: "", originalContent: "y", editDistance: null, createdAt: new Date(), account: { handle: "grafikcem" } },
    { id: "fe-c", feedbackType: "hook_weak", reason: "", editedContent: "", originalContent: "z", editDistance: null, createdAt: new Date(), account: { handle: "maskulenkod" } },
  ];

  it("kaçırılmış event'i tamamlar; bağlı olanı atlar; sinyalsizi sayar", async () => {
    feFindMany.mockResolvedValue(rows);
    evFindMany.mockResolvedValue([{ sourceId: "fe-a" }]); // fe-a zaten deftere bağlı
    const s = await reconcileFeedbackSignals();
    expect(s.scanned).toBe(3);
    expect(s.alreadyLinked).toBe(1);
    expect(s.ingested).toBe(1); // fe-c (hook_weak)
    expect(s.noSignal).toBe(1); // fe-b (reason'sız approved)
    expect(proposeFactMock).toHaveBeenCalledTimes(1);
  });

  it("ikinci koşu idempotent: hepsi bağlıysa hiçbir şey yazmaz", async () => {
    feFindMany.mockResolvedValue(rows);
    evFindMany.mockResolvedValue([{ sourceId: "fe-a" }, { sourceId: "fe-b" }, { sourceId: "fe-c" }]);
    const s = await reconcileFeedbackSignals();
    expect(s.ingested).toBe(0);
    expect(s.alreadyLinked).toBe(3);
    expect(proposeFactMock).not.toHaveBeenCalled();
  });

  it("tek event hatası taramayı durdurmaz", async () => {
    feFindMany.mockResolvedValue(rows);
    evFindMany.mockResolvedValue([]);
    proposeFactMock.mockRejectedValueOnce(new Error("db down"));
    const s = await reconcileFeedbackSignals();
    expect(s.errors).toBe(1);
    expect(s.ingested + s.noSignal + s.errors).toBe(3);
  });

  it("ADR-045: sorgu neutralizedAt:null ister → etkisizleştirilmiş sinyaller köprüye HİÇ girmez", async () => {
    feFindMany.mockResolvedValue([]);
    evFindMany.mockResolvedValue([]);
    await reconcileFeedbackSignals();
    const where = feFindMany.mock.calls[0][0].where as { neutralizedAt: unknown };
    expect(where.neutralizedAt).toBeNull();
  });
});

describe("setFeedbackSignalNeutralized (ADR-045 — yanlış sinyali etkisizleştir/geri al)", () => {
  it("bulunamayan event → not_found; hiçbir mutasyon yapılmaz", async () => {
    feFindUnique.mockResolvedValue(null);
    const r = await setFeedbackSignalNeutralized("grafikcem", "fe-x", true);
    expect(r).toEqual({ ok: false, code: "not_found" });
    expect(feUpdate).not.toHaveBeenCalled();
  });

  it("başka hesabın sinyali → account_mismatch fail-closed; mutasyon yok", async () => {
    feFindUnique.mockResolvedValue({ id: "fe-1", account: { handle: "maskulenkod" } });
    const r = await setFeedbackSignalNeutralized("grafikcem", "fe-1", true);
    expect(r).toEqual({ ok: false, code: "account_mismatch" });
    expect(feUpdate).not.toHaveBeenCalled();
  });

  it("etkisizleştir → neutralizedAt bir Date'e set edilir (ham kayıt silinmez)", async () => {
    feFindUnique.mockResolvedValue({ id: "fe-1", account: { handle: "grafikcem" } });
    feUpdate.mockResolvedValue({});
    const r = await setFeedbackSignalNeutralized("grafikcem", "fe-1", true);
    expect(r).toEqual({ ok: true, id: "fe-1", neutralized: true });
    const arg = feUpdate.mock.calls[0][0] as { where: { id: string }; data: { neutralizedAt: Date | null } };
    expect(arg.where.id).toBe("fe-1");
    expect(arg.data.neutralizedAt).toBeInstanceOf(Date);
  });

  it("geri al → neutralizedAt null'a çekilir (idempotent geri dönüş)", async () => {
    feFindUnique.mockResolvedValue({ id: "fe-1", account: { handle: "grafikcem" } });
    feUpdate.mockResolvedValue({});
    const r = await setFeedbackSignalNeutralized("grafikcem", "fe-1", false);
    expect(r).toEqual({ ok: true, id: "fe-1", neutralized: false });
    const arg = feUpdate.mock.calls[0][0] as { data: { neutralizedAt: Date | null } };
    expect(arg.data.neutralizedAt).toBeNull();
  });
});
