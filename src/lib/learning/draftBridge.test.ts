import { describe, it, expect, vi, beforeEach } from "vitest";

const getPackDetail = vi.fn();
vi.mock("./learnService", () => ({
  learnService: { getPackDetail: (...a: unknown[]) => getPackDetail(...a) },
}));

const accountFindUnique = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: { account: { findUnique: (...a: unknown[]) => accountFindUnique(...a) } },
}));

const findByOriginKey = vi.fn();
const create = vi.fn();
vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: {
    findByOriginKey: (...a: unknown[]) => findByOriginKey(...a),
    create: (...a: unknown[]) => create(...a),
  },
}));

const createHandoff = vi.fn();
vi.mock("@/lib/services/opportunityHandoffService", () => ({
  opportunityHandoffService: { createHandoff: (...a: unknown[]) => createHandoff(...a) },
}));

import { createDraftFromLearnIdea, classifyIdeaFormat } from "./draftBridge";

function pack(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    source: { title: "Test Video" },
    contentIdeas: [
      { id: "i1", title: "Başlık", hook: "Hook cümlesi", angle: "Açı", format: "thread", groundingType: "inference" },
      { id: "ic", title: "Carousel fikri", hook: "Kanca", angle: "Açı2", format: "carousel", groundingType: "inference" },
      { id: "ir", title: "Reel fikri", hook: "Reel kancası", angle: "Açı3", format: "reel", groundingType: "inference" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPackDetail.mockResolvedValue(pack());
  accountFindUnique.mockResolvedValue({ id: "acc-1" });
  findByOriginKey.mockResolvedValue(null);
  create.mockResolvedValue({ id: "q-new" });
  createHandoff.mockResolvedValue({ handoff: { id: "h-new" }, reused: false });
});

describe("classifyIdeaFormat (5E — format→hedef yüzey)", () => {
  it("carousel → series/Seriler", () => {
    expect(classifyIdeaFormat("carousel")).toEqual({ action: "series", suggestedPlatform: "Instagram", target: "plan-seriler" });
  });
  it("reel/reels → plan/Takvim", () => {
    expect(classifyIdeaFormat("reel")).toEqual({ action: "plan", suggestedPlatform: "Reels", target: "plan-takvim" });
    expect(classifyIdeaFormat("Reels")).toEqual({ action: "plan", suggestedPlatform: "Reels", target: "plan-takvim" });
  });
  it("tweet/thread/video/boş/bilinmeyen → X (null)", () => {
    for (const f of ["tweet", "thread", "video", "", null, undefined, "story", "xyz"]) {
      expect(classifyIdeaFormat(f)).toBeNull();
    }
  });
});

describe("createDraftFromLearnIdea (ADR-045 + 5E — format-farkında handoff)", () => {
  it("paket yoksa pack_not_found; hiçbir şey yazılmaz", async () => {
    getPackDetail.mockResolvedValue(null);
    expect(await createDraftFromLearnIdea("pX", "i1", "grafikcem")).toEqual({ ok: false, code: "pack_not_found" });
    expect(create).not.toHaveBeenCalled();
    expect(createHandoff).not.toHaveBeenCalled();
  });

  it("fikir yoksa idea_not_found", async () => {
    expect(await createDraftFromLearnIdea("p1", "i99", "grafikcem")).toEqual({ ok: false, code: "idea_not_found" });
    expect(create).not.toHaveBeenCalled();
    expect(createHandoff).not.toHaveBeenCalled();
  });

  it("hesap yoksa account_not_found (fail-closed, mutasyon yok)", async () => {
    accountFindUnique.mockResolvedValue(null);
    expect(await createDraftFromLearnIdea("p1", "i1", "bilinmeyen")).toEqual({ ok: false, code: "account_not_found" });
    expect(create).not.toHaveBeenCalled();
    expect(createHandoff).not.toHaveBeenCalled();
  });

  it("X formatı (thread): kind=draft, originKey hesap-scoped, mode learn_idea, TWEET, status default", async () => {
    const r = await createDraftFromLearnIdea("p1", "i1", "grafikcem");
    expect(r).toEqual({ ok: true, kind: "draft", draftId: "q-new", reused: false });
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.originKey).toBe("learn:p1:i1:acc-1");
    expect(arg.accountId).toBe("acc-1");
    expect(arg.mode).toBe("learn_idea");
    expect(arg.draftType).toBe("TWEET");
    expect(arg.content).toBe("Başlık\n\nHook cümlesi\n\nAçı");
    expect(arg.status).toBeUndefined();
    expect(createHandoff).not.toHaveBeenCalled();
  });

  it("carousel fikri: X taslağı DEĞİL — Seriler handoff'u (create ÇAĞRILMAZ)", async () => {
    const r = await createDraftFromLearnIdea("p1", "ic", "grafikcem");
    expect(r).toEqual({ ok: true, kind: "handoff", handoffId: "h-new", action: "series", target: "plan-seriler", reused: false });
    expect(create).not.toHaveBeenCalled();
    const arg = createHandoff.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.accountId).toBe("acc-1"); // server-otoriteli
    expect(arg.action).toBe("series");
    expect(arg.sourceKind).toBe("learn");
    expect(arg.sourceId).toBe("p1:ic");
    expect(arg.suggestedPlatform).toBe("Instagram");
    expect(arg.topicSeed).toBe("Kanca · Açı2");
  });

  it("reel fikri: Takvim handoff'u (action plan, target plan-takvim)", async () => {
    createHandoff.mockResolvedValue({ handoff: { id: "h-reel" }, reused: false });
    const r = await createDraftFromLearnIdea("p1", "ir", "grafikcem");
    expect(r).toEqual({ ok: true, kind: "handoff", handoffId: "h-reel", action: "plan", target: "plan-takvim", reused: false });
    expect(create).not.toHaveBeenCalled();
    expect((createHandoff.mock.calls[0][0] as Record<string, unknown>).suggestedPlatform).toBe("Reels");
  });

  it("handoff idempotent: reused geçer (duplicate satır yok)", async () => {
    createHandoff.mockResolvedValue({ handoff: { id: "h-existing" }, reused: true });
    const r = await createDraftFromLearnIdea("p1", "ic", "grafikcem");
    expect(r).toEqual({ ok: true, kind: "handoff", handoffId: "h-existing", action: "series", target: "plan-seriler", reused: true });
  });

  it("X idempotent: mevcut originKey → reused draft, create ÇAĞRILMAZ", async () => {
    findByOriginKey.mockResolvedValue({ id: "q-existing" });
    const r = await createDraftFromLearnIdea("p1", "i1", "grafikcem");
    expect(r).toEqual({ ok: true, kind: "draft", draftId: "q-existing", reused: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("X yarış: create P2002 → mevcut taslağı döndürür (500 fırlatmaz)", async () => {
    findByOriginKey.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "q-raced" });
    create.mockRejectedValue({ code: "P2002" });
    const r = await createDraftFromLearnIdea("p1", "i1", "grafikcem");
    expect(r).toEqual({ ok: true, kind: "draft", draftId: "q-raced", reused: true });
  });
});
