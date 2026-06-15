import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { account: { findUnique: vi.fn(() => Promise.resolve({ id: "acc1" })) } },
}));
vi.mock("@/lib/instagram/igClient", () => ({
  isConfigured: vi.fn(() => Promise.resolve(true)),
  getRecentMedia: vi.fn(),
  getComments: vi.fn(),
  // Faz E — sync artık DM + insight iç-stage'i koşar; testte no-op default.
  getConversations: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
  getConversationMessages: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
  getAccountInsights: vi.fn(() => Promise.resolve({ ok: false, error: "not_configured" })),
  getFollowerCount: vi.fn(() => Promise.resolve({ ok: false, error: "not_configured" })),
  getMediaInsights: vi.fn(() => Promise.resolve({ ok: false, error: "not_configured" })),
}));
vi.mock("@/lib/instagram/dm-pipeline", () => ({
  translateInbound: vi.fn(() => Promise.resolve([])),
  updateRollingSummary: vi.fn((prev: string) => Promise.resolve(prev)),
  generateDmVariants: vi.fn(() => Promise.resolve([])),
  scoreDmRisk: vi.fn(() => Promise.resolve({ safety: 80, usedLlm: true })),
}));
vi.mock("@/lib/db/igConversationRepo", () => ({
  igConversationRepo: {
    upsertByConversationId: vi.fn(() => Promise.resolve({})),
    getByConversationId: vi.fn(() => Promise.resolve(null)),
    listRecent: vi.fn(() => Promise.resolve([])),
    setRollingSummary: vi.fn(() => Promise.resolve({})),
  },
}));
vi.mock("@/lib/db/igMessageRepo", () => ({
  igMessageRepo: {
    upsertByMessageId: vi.fn(() => Promise.resolve({})),
    listByConversation: vi.fn(() => Promise.resolve([])),
    listNewInbound: vi.fn(() => Promise.resolve([])),
    updateTranslation: vi.fn(() => Promise.resolve({})),
    countNewInbound: vi.fn(() => Promise.resolve(0)),
    countInConversation: vi.fn(() => Promise.resolve(0)),
  },
}));
vi.mock("@/lib/db/igDmDraftRepo", () => ({
  igDmDraftRepo: {
    create: vi.fn((i) => Promise.resolve({ id: "dm" + i.variant, ...i })),
    getById: vi.fn(),
    listByConversation: vi.fn(() => Promise.resolve([])),
    deleteByConversation: vi.fn(() => Promise.resolve({ count: 0 })),
    update: vi.fn((id, d) => Promise.resolve({ id, ...d })),
  },
}));
vi.mock("@/lib/db/igInsightSnapshotRepo", () => ({
  igInsightSnapshotRepo: {
    upsertByDate: vi.fn(() => Promise.resolve({})),
    getByDate: vi.fn(() => Promise.resolve(null)),
    listRecent: vi.fn(() => Promise.resolve([])),
  },
}));
vi.mock("@/lib/instagram/comment-pipeline", () => ({
  classifyBatch: vi.fn(),
  generateReplyVariants: vi.fn(),
  scoreReplyRisk: vi.fn(() => Promise.resolve({ safety: 80, usedLlm: true })),
}));
vi.mock("@/lib/db/igMediaRepo", () => ({
  igMediaRepo: {
    upsertByMediaId: vi.fn(() => Promise.resolve({})),
    getByMediaId: vi.fn(() => Promise.resolve({ caption: "cap" })),
  },
}));
vi.mock("@/lib/db/igCommentRepo", () => ({
  igCommentRepo: {
    upsertByCommentId: vi.fn(() => Promise.resolve({})),
    listNew: vi.fn(() => Promise.resolve([])),
    updateAnalysis: vi.fn(() => Promise.resolve({})),
    getByCommentId: vi.fn(),
    listForBulkDrafts: vi.fn(() => Promise.resolve([])),
    setStatus: vi.fn(() => Promise.resolve({})),
  },
}));
vi.mock("@/lib/db/igReplyDraftRepo", () => ({
  igReplyDraftRepo: {
    create: vi.fn((i) => Promise.resolve({ id: "d" + i.variant, ...i })),
    getById: vi.fn(),
    update: vi.fn((id, d) => Promise.resolve({ id, ...d })),
    deleteByComment: vi.fn(() => Promise.resolve({ count: 0 })),
  },
}));
vi.mock("@/lib/db/feedbackEventRepo", () => ({
  feedbackEventRepo: { create: vi.fn(() => Promise.resolve({})) },
}));
vi.mock("@/lib/db/publishLogRepo", () => ({
  publishLogRepo: { create: vi.fn(() => Promise.resolve({})) },
}));
vi.mock("@/lib/db/trainingExampleRepo", () => ({
  trainingExampleRepo: { create: vi.fn(() => Promise.resolve({})) },
}));
vi.mock("@/lib/services/usageService", () => ({
  usageService: { getMonthlySpendByPurpose: vi.fn(() => Promise.resolve(0)) },
}));

import { instagramService } from "./instagramService";
import { isConfigured, getRecentMedia, getComments } from "@/lib/instagram/igClient";
import {
  classifyBatch,
  generateReplyVariants,
  scoreReplyRisk,
} from "@/lib/instagram/comment-pipeline";
import { igCommentRepo } from "@/lib/db/igCommentRepo";
import { igReplyDraftRepo } from "@/lib/db/igReplyDraftRepo";
import { publishLogRepo } from "@/lib/db/publishLogRepo";
import { feedbackEventRepo } from "@/lib/db/feedbackEventRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { usageService } from "@/lib/services/usageService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isConfigured).mockResolvedValue(true);
  vi.mocked(usageService.getMonthlySpendByPurpose).mockResolvedValue(0);
  vi.mocked(scoreReplyRisk).mockResolvedValue({ safety: 80, usedLlm: true });
});

describe("instagramService.sync", () => {
  it("configured:false → boş, API çağrılmaz", async () => {
    vi.mocked(isConfigured).mockResolvedValue(false);
    const r = await instagramService.sync({ deadlineMs: 10_000 });
    expect(r.configured).toBe(false);
    expect(getRecentMedia).not.toHaveBeenCalled();
  });

  it("media + yorumları upsert eder", async () => {
    vi.mocked(getRecentMedia).mockResolvedValue({
      ok: true,
      data: [{ id: "m1", caption: "c" }],
    } as never);
    vi.mocked(getComments).mockResolvedValue({
      ok: true,
      data: [{ id: "cm1", text: "hi" }],
    } as never);
    vi.mocked(igCommentRepo.listNew).mockResolvedValue([]);
    const r = await instagramService.sync({ deadlineMs: 10_000 });
    expect(r.mediaSynced).toBe(1);
    expect(r.commentsUpserted).toBe(1);
    expect(igCommentRepo.upsertByCommentId).toHaveBeenCalled();
  });

  it("getComments hatası → errors++, devam", async () => {
    vi.mocked(getRecentMedia).mockResolvedValue({ ok: true, data: [{ id: "m1" }] } as never);
    vi.mocked(getComments).mockResolvedValue({ ok: false, error: "404" } as never);
    vi.mocked(igCommentRepo.listNew).mockResolvedValue([]);
    const r = await instagramService.sync({ deadlineMs: 10_000 });
    expect(r.errors).toBe(1);
    expect(r.mediaSynced).toBe(1);
  });
});

describe("instagramService.analyzeNewComments", () => {
  it("bozuk batch → yorumlar new kalır", async () => {
    vi.mocked(igCommentRepo.listNew).mockResolvedValue([
      { commentId: "c0", mediaId: "m1", text: "t", username: "u" },
    ] as never);
    vi.mocked(classifyBatch).mockRejectedValue(new Error("bozuk json"));
    const r = await instagramService.analyzeNewComments();
    expect(r.errors).toBe(1);
    expect(igCommentRepo.updateAnalysis).not.toHaveBeenCalled();
  });

  it("bütçe aşımı → LLM çağrılmaz", async () => {
    vi.mocked(usageService.getMonthlySpendByPurpose).mockResolvedValue(99);
    const r = await instagramService.analyzeNewComments();
    expect(r.classified).toBe(0);
    expect(classifyBatch).not.toHaveBeenCalled();
  });

  it("başarılı batch → updateAnalysis", async () => {
    vi.mocked(igCommentRepo.listNew).mockResolvedValue([
      { commentId: "c0", mediaId: "m1", text: "t", username: "u" },
    ] as never);
    vi.mocked(classifyBatch).mockResolvedValue([
      {
        commentId: "c0",
        lang: "tr",
        trText: "t",
        intent: "soru",
        intentConfidence: 0.8,
        sentiment: "nötr",
        priority: 70,
      },
    ] as never);
    const r = await instagramService.analyzeNewComments();
    expect(r.classified).toBe(1);
    expect(igCommentRepo.updateAnalysis).toHaveBeenCalledWith(
      "c0",
      expect.objectContaining({ priority: 70 })
    );
  });
});

describe("instagramService.generateReplyDrafts", () => {
  it("eleştiri + safety<40 → riskWarning true", async () => {
    vi.mocked(igCommentRepo.getByCommentId).mockResolvedValue({
      commentId: "c0",
      mediaId: "m1",
      text: "kötü",
      trText: "kötü",
      lang: "tr",
      intent: "eleştiri",
    } as never);
    vi.mocked(generateReplyVariants).mockResolvedValue([
      { textTr: "yanıt", textOriginal: null, tone: "samimi" },
    ] as never);
    vi.mocked(scoreReplyRisk).mockResolvedValue({ safety: 20, usedLlm: true });
    const r = await instagramService.generateReplyDrafts({ commentId: "c0" });
    expect(r.results[0].riskWarning).toBe(true);
  });

  it("yabancı dilde textOriginal taslağa geçer", async () => {
    vi.mocked(igCommentRepo.getByCommentId).mockResolvedValue({
      commentId: "c1",
      mediaId: "m1",
      text: "hi",
      trText: "merhaba",
      lang: "en",
      intent: "soru",
    } as never);
    vi.mocked(generateReplyVariants).mockResolvedValue([
      { textTr: "merhaba", textOriginal: "hello", tone: "samimi" },
    ] as never);
    await instagramService.generateReplyDrafts({ commentId: "c1" });
    expect(igReplyDraftRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ textOriginal: "hello" })
    );
  });
});

describe("instagramService.recordFeedback", () => {
  it("sent → PublishLog + FeedbackEvent(approved) + TrainingExample + comment replied", async () => {
    vi.mocked(igReplyDraftRepo.getById).mockResolvedValue({
      id: "d0",
      commentId: "c0",
      textTr: "yanıt",
    } as never);
    vi.mocked(igCommentRepo.getByCommentId).mockResolvedValue({
      commentId: "c0",
      text: "orijinal",
    } as never);
    await instagramService.recordFeedback("d0", "sent");
    expect(publishLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram" })
    );
    expect(feedbackEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackType: "approved", platform: "instagram" })
    );
    expect(trainingExampleRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ inputType: "ig_reply", label: "good" })
    );
    expect(igCommentRepo.setStatus).toHaveBeenCalledWith("c0", "replied");
  });

  it("dismissed → PublishLog yok, FeedbackEvent(rejected)", async () => {
    vi.mocked(igReplyDraftRepo.getById).mockResolvedValue({
      id: "d0",
      commentId: "c0",
      textTr: "yanıt",
    } as never);
    vi.mocked(igCommentRepo.getByCommentId).mockResolvedValue({
      commentId: "c0",
      text: "x",
    } as never);
    await instagramService.recordFeedback("d0", "dismissed");
    expect(publishLogRepo.create).not.toHaveBeenCalled();
    expect(feedbackEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackType: "rejected" })
    );
  });

  it("draft yoksa hata fırlatır", async () => {
    vi.mocked(igReplyDraftRepo.getById).mockResolvedValue(null);
    await expect(instagramService.recordFeedback("missing", "sent")).rejects.toThrow(
      "draft_not_found"
    );
  });
});
