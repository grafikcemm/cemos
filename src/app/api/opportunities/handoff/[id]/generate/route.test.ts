import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * ADR-028 — generate route sözleşmesi: blocked-external'da sahte taslak YOK,
 * başarıda atomik QueueItem+consume, retry idempotent. Ağ/ücret yok (executor
 * + DB mock).
 */

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: () => true }));

const executeAgentMock = vi.fn();
vi.mock("@/lib/agents/registry", () => ({
  executeAgent: (...args: unknown[]) => executeAgentMock(...args),
}));

const handoffFindUnique = vi.fn();
const handoffUpdate = vi.fn();
const handoffUpdateMany = vi.fn();
const queueItemCreate = vi.fn();
const accountFindUnique = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: (...a: unknown[]) => accountFindUnique(...a) },
    opportunityHandoff: {
      findUnique: (...a: unknown[]) => handoffFindUnique(...a),
      update: (...a: unknown[]) => handoffUpdate(...a),
      updateMany: (...a: unknown[]) => handoffUpdateMany(...a),
    },
    queueItem: { create: (...a: unknown[]) => queueItemCreate(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        opportunityHandoff: {
          findUnique: (...a: unknown[]) => handoffFindUnique(...a),
          update: (...a: unknown[]) => handoffUpdate(...a),
          updateMany: (...a: unknown[]) => handoffUpdateMany(...a),
        },
        queueItem: { create: (...a: unknown[]) => queueItemCreate(...a) },
      }),
  },
}));

import { POST } from "./route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/opportunities/handoff/h-1/generate", { method: "POST" });
}
const ctx = { params: Promise.resolve({ id: "h-1" }) };

function handoffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "h-1",
    accountId: "acc-1",
    action: "generate",
    status: "pending",
    sourceKind: "news",
    sourceId: "news-1",
    title: "AI görsel tespiti",
    topicSeed: "AI görsel tespiti",
    whyNow: "taze",
    whyNowDetail: "",
    payloadJson: JSON.stringify({ schemaVersion: "1" }),
    resultQueueItemId: null,
    resultRef: null,
    blockedReason: null,
    ...overrides,
  };
}

const WINNER = {
  content: "Gerçek üretilmiş taslak metni.",
  personaMatch: 84,
  turkishNaturalness: 82,
  hookStrength: 78,
  clarity: 80,
  novelty: 71,
  risk: 15,
  sourceFaithfulness: 88,
};

beforeEach(() => {
  vi.clearAllMocks();
  accountFindUnique.mockResolvedValue({ id: "acc-1", handle: "grafikcem", platform: "x" });
});

describe("POST /api/opportunities/handoff/[id]/generate", () => {
  it("blocked-external: fırsat KAYBOLMAZ, sahte taslak YAZILMAZ, Türkçe mesaj + kurtarma", async () => {
    handoffFindUnique.mockResolvedValue(handoffRow());
    executeAgentMock.mockResolvedValue({
      status: "blocked_external",
      blockedReason: "budget:provider_key_limit",
      output: null,
      costUsd: 0,
    });
    handoffUpdate.mockResolvedValue(handoffRow({ blockedReason: "budget:provider_key_limit" }));

    const res = await POST(req(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.blocked).toBe(true);
    expect(json.message).toContain("Entegrasyonlar");
    expect(queueItemCreate).not.toHaveBeenCalled();
    expect(handoffUpdateMany).not.toHaveBeenCalled(); // consume edilmedi — pending
  });

  it("mock fallback çıktısı = sahte taslak; QueueItem YAZILMAZ", async () => {
    handoffFindUnique.mockResolvedValue(handoffRow());
    executeAgentMock.mockResolvedValue({
      status: "succeeded",
      output: { usedMock: true, winner: WINNER, rankedCandidates: [] },
      costUsd: 0,
    });
    handoffUpdate.mockResolvedValue(handoffRow({ blockedReason: "generation_mock_fallback" }));

    const res = await POST(req(), ctx);
    const json = await res.json();
    expect(json.blocked).toBe(true);
    expect(json.reason).toBe("generation_mock_fallback");
    expect(queueItemCreate).not.toHaveBeenCalled();
  });

  it("başarı: consume claim + QueueItem + sonuç referansı atomik; insan onayı korunur (status new)", async () => {
    handoffFindUnique.mockResolvedValue(handoffRow());
    executeAgentMock.mockResolvedValue({
      status: "succeeded",
      output: { usedMock: false, winner: WINNER, rankedCandidates: [WINNER] },
      costUsd: 0.004,
    });
    handoffUpdateMany.mockResolvedValue({ count: 1 });
    queueItemCreate.mockResolvedValue({ id: "qi-new" });
    handoffUpdate.mockResolvedValue(handoffRow({ status: "consumed", resultQueueItemId: "qi-new" }));

    const res = await POST(req(), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.queueItemId).toBe("qi-new");
    const created = queueItemCreate.mock.calls[0][0].data;
    expect(created.status).toBe("new"); // otomatik publish YOK
    expect(created.mode).toBe("opportunity");
    const scores = JSON.parse(created.scores);
    expect(scores.fromHandoffId).toBe("h-1");
    expect(scores.judged).toBe(true);
  });

  it("retry idempotent: consumed handoff yeni taslak ÜRETMEZ, mevcut id döner", async () => {
    handoffFindUnique.mockResolvedValue(handoffRow({ status: "consumed", resultQueueItemId: "qi-old" }));
    const res = await POST(req(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.alreadyConsumed).toBe(true);
    expect(json.queueItemId).toBe("qi-old");
    expect(executeAgentMock).not.toHaveBeenCalled(); // LLM'e bile inmez
    expect(queueItemCreate).not.toHaveBeenCalled();
  });

  it("eşzamanlı yarış: claim'i kaybeden QueueItem YAZMAZ", async () => {
    handoffFindUnique
      .mockResolvedValueOnce(handoffRow()) // route başı kontrol
      .mockResolvedValueOnce(handoffRow()) // consume içi ilk okuma
      .mockResolvedValueOnce(handoffRow({ status: "consumed", resultQueueItemId: "qi-winner" })); // claim 0 → mevcut
    executeAgentMock.mockResolvedValue({
      status: "succeeded",
      output: { usedMock: false, winner: WINNER, rankedCandidates: [] },
      costUsd: 0,
    });
    handoffUpdateMany.mockResolvedValue({ count: 0 }); // yarış kaybedildi

    const res = await POST(req(), ctx);
    const json = await res.json();
    expect(json.alreadyConsumed).toBe(true);
    expect(json.queueItemId).toBe("qi-winner");
    expect(queueItemCreate).not.toHaveBeenCalled();
  });

  it("yanlış action 422; iptal edilmiş 409", async () => {
    handoffFindUnique.mockResolvedValue(handoffRow({ action: "plan" }));
    expect((await POST(req(), ctx)).status).toBe(422);
    handoffFindUnique.mockResolvedValue(handoffRow({ status: "cancelled" }));
    expect((await POST(req(), ctx)).status).toBe(409);
  });

  it("failed_execution: fırsat pending kalır, 502 + yeniden dene mesajı", async () => {
    handoffFindUnique.mockResolvedValue(handoffRow());
    executeAgentMock.mockResolvedValue({ status: "failed_execution", errorMessage: "patladı", output: null, costUsd: 0 });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(502);
    expect(queueItemCreate).not.toHaveBeenCalled();
    expect(handoffUpdateMany).not.toHaveBeenCalled();
  });
});
