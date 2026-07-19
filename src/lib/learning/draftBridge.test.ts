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

import { createDraftFromLearnIdea } from "./draftBridge";

function pack(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    source: { title: "Test Video" },
    contentIdeas: [
      { id: "i1", title: "Başlık", hook: "Hook cümlesi", angle: "Açı", format: "thread", groundingType: "inference" },
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
});

describe("createDraftFromLearnIdea (ADR-045 — öğrenme fikri → X taslağı)", () => {
  it("paket yoksa pack_not_found; hiçbir taslak yazılmaz", async () => {
    getPackDetail.mockResolvedValue(null);
    expect(await createDraftFromLearnIdea("pX", "i1", "grafikcem")).toEqual({ ok: false, code: "pack_not_found" });
    expect(create).not.toHaveBeenCalled();
  });

  it("fikir yoksa idea_not_found", async () => {
    expect(await createDraftFromLearnIdea("p1", "i99", "grafikcem")).toEqual({ ok: false, code: "idea_not_found" });
    expect(create).not.toHaveBeenCalled();
  });

  it("hesap yoksa account_not_found (fail-closed, mutasyon yok)", async () => {
    accountFindUnique.mockResolvedValue(null);
    expect(await createDraftFromLearnIdea("p1", "i1", "bilinmeyen")).toEqual({ ok: false, code: "account_not_found" });
    expect(create).not.toHaveBeenCalled();
  });

  it("yeni taslak: originKey hesap-scoped, content title+hook+angle, mode learn_idea, X, status default (publish YOK)", async () => {
    const r = await createDraftFromLearnIdea("p1", "i1", "grafikcem");
    expect(r).toEqual({ ok: true, draftId: "q-new", reused: false });
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.originKey).toBe("learn:p1:i1:acc-1");
    expect(arg.accountId).toBe("acc-1");
    expect(arg.mode).toBe("learn_idea");
    expect(arg.draftType).toBe("TWEET");
    expect(arg.content).toBe("Başlık\n\nHook cümlesi\n\nAçı");
    expect(arg.status).toBeUndefined(); // DB default "new" → otomatik publish yok
    expect(JSON.parse(arg.scores as string)).toMatchObject({
      source: "learn_pack",
      packId: "p1",
      ideaId: "i1",
      groundingType: "inference",
      sourceTitle: "Test Video",
    });
  });

  it("idempotent: mevcut originKey → reused, create ÇAĞRILMAZ (duplicate queue item yok)", async () => {
    findByOriginKey.mockResolvedValue({ id: "q-existing" });
    const r = await createDraftFromLearnIdea("p1", "i1", "grafikcem");
    expect(r).toEqual({ ok: true, draftId: "q-existing", reused: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("yarış: create P2002 → mevcut taslağı döndürür (500 fırlatmaz)", async () => {
    findByOriginKey.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "q-raced" });
    create.mockRejectedValue({ code: "P2002" });
    const r = await createDraftFromLearnIdea("p1", "i1", "grafikcem");
    expect(r).toEqual({ ok: true, draftId: "q-raced", reused: true });
  });
});
