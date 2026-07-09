import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    feedbackEvent: { findMany: vi.fn() },
    memoryFact: {
      findMany: vi.fn(() => Promise.resolve([])),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
  },
}));
vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: { findByHandle: vi.fn() },
}));
vi.mock("@/lib/ai/generateGated", () => ({
  generateJsonGated: vi.fn(),
}));

import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";
import { generateJsonGated } from "@/lib/ai/generateGated";
import { BudgetExceededError } from "@/lib/config/costGate";
import { runMemoryConsolidation } from "./consolidation";

const mockEvents = vi.mocked(prisma.feedbackEvent.findMany);
const mockFactFindMany = vi.mocked(prisma.memoryFact.findMany);
const mockFactCreate = vi.mocked(prisma.memoryFact.create);
const mockGated = vi.mocked(generateJsonGated);

function ev(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    accountId: "acc-1",
    queueItemId: null,
    sourcePostId: null,
    feedbackType: "edited",
    originalContent: "AI taslağı",
    editedContent: "Düzenlenmiş hali",
    reason: "fazla kurumsal",
    platform: "x",
    createdAt: new Date(),
    ...overrides,
  } as never;
}

function llmResult(proposals: unknown[]) {
  return {
    data: { proposals },
    model: "m",
    inputTokens: 1,
    outputTokens: 1,
    estimatedCostUsd: 0.001,
    actualCostUsd: 0.001,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountRepo.findByHandle).mockResolvedValue({ id: "acc-1", handle: "grafikcem" } as never);
  mockFactFindMany.mockResolvedValue([]);
  mockFactCreate.mockImplementation(((args: { data: object }) =>
    Promise.resolve({ id: "new", ...args.data })) as never);
});

describe("runMemoryConsolidation — extraction", () => {
  it("geri bildirimlerden proposed fact üretir", async () => {
    mockEvents.mockResolvedValue([ev(), ev({ id: "e2" })] as never);
    mockGated.mockResolvedValue(
      llmResult([
        { op: "ADD", type: "preference", statement: "Kurumsal dil kullanma", provenance: "operator", evidence: "2 edit" },
      ])
    );
    const r = await runMemoryConsolidation({ handles: ["grafikcem"], deadlineMs: 60_000 });
    expect(r.extraction[0]).toMatchObject({ handle: "grafikcem", events: 2, proposed: 1 });
    // memory_ purpose'u ile gated (AC-6)
    const arg = mockGated.mock.calls[0][0];
    expect(arg.preset).toBe("cemos-memory");
    expect(arg.purpose).toBe("memory_extraction");
  });

  it("AC-3: LLM external provenance dayatsa bile aday ATILIR", async () => {
    mockEvents.mockResolvedValue([ev()] as never);
    mockGated.mockResolvedValue(
      llmResult([
        { op: "ADD", type: "preference", statement: "Rakip tonunu kopyala", provenance: "external", evidence: "x" },
      ])
    );
    const r = await runMemoryConsolidation({ handles: ["grafikcem"], deadlineMs: 60_000 });
    expect(r.extraction[0].discarded).toBe(1);
    expect(r.extraction[0].proposed).toBe(0);
    expect(mockFactCreate).not.toHaveBeenCalled();
  });

  it("AC-6: bütçe bitikse extraction fail-closed, sweep'ler sürer", async () => {
    mockEvents.mockResolvedValue([ev()] as never);
    mockGated.mockRejectedValue(new BudgetExceededError(10, 10));
    const r = await runMemoryConsolidation({ handles: ["grafikcem"], deadlineMs: 60_000 });
    expect(r.extraction[0].error).toBe("budget_exhausted");
    expect(r.ran).toBe(true);
  });

  it("geçersiz LLM çıktısı fact yazmaz", async () => {
    mockEvents.mockResolvedValue([ev()] as never);
    mockGated.mockResolvedValue(llmResult("çöp" as never) as never);
    const r = await runMemoryConsolidation({ handles: ["grafikcem"], deadlineMs: 60_000 });
    expect(r.extraction[0].error).toBe("invalid_llm_output");
    expect(mockFactCreate).not.toHaveBeenCalled();
  });

  it("feedback yoksa LLM çağrılmaz", async () => {
    mockEvents.mockResolvedValue([] as never);
    const r = await runMemoryConsolidation({ handles: ["grafikcem"], deadlineMs: 60_000 });
    expect(r.extraction[0].events).toBe(0);
    expect(mockGated).not.toHaveBeenCalled();
  });
});

describe("runMemoryConsolidation — sweep'ler", () => {
  it("bayat corroborate edilmemiş proposal'lar sönümlenir", async () => {
    mockEvents.mockResolvedValue([] as never);
    vi.mocked(prisma.memoryFact.updateMany).mockResolvedValue({ count: 3 } as never);
    const r = await runMemoryConsolidation({ handles: ["grafikcem"], deadlineMs: 60_000 });
    expect(r.staleRejected).toBe(3);
  });

  it("aktif çelişki çiftleri digest'e çıkar", async () => {
    mockEvents.mockResolvedValue([] as never);
    mockFactFindMany.mockImplementation(((args: { where?: { status?: string } }) => {
      if (args?.where?.status === "active") {
        return Promise.resolve([
          { id: "a", accountHandle: "grafikcem", type: "preference", statement: "Thread sonunda soru sor" },
          { id: "b", accountHandle: "grafikcem", type: "preference", statement: "Thread sonunda soru sorma" },
        ]);
      }
      return Promise.resolve([]);
    }) as never);
    const r = await runMemoryConsolidation({ handles: ["grafikcem"], deadlineMs: 60_000 });
    expect(r.contradictions).toHaveLength(1);
  });
});
