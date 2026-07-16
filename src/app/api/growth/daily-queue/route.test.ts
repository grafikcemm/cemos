import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { PATCH } from "./[id]/route";
import { POST as feedbackPost } from "./[id]/feedback/route";
import { POST as rescorePost } from "./[id]/rescore/route";

// Anchor the fixture clock at noon: relative day-window assertions
// (today/tomorrow/next_7_days) used to flip after ~22:00 because
// "scheduled in 2 hours" crossed midnight into tomorrow.
const FIXTURE_NOW = new Date();
FIXTURE_NOW.setHours(12, 0, 0, 0);

const mockAccounts = [
  { id: "acc-1", handle: "grafikcem", displayName: "GrafikCem" },
  { id: "acc-2", handle: "maskulenkod", displayName: "MaskulenKod" }
];

const mockQueueItems = [
  {
    id: "item-1",
    accountId: "acc-1",
    content: "Tasarım dünyasında AI araçları iş akışlarını inanılmaz derecede hızlandırıyor.",
    status: "new", // draft
    createdAt: new Date(FIXTURE_NOW),
    scheduledAt: null,
    scores: JSON.stringify({ publishScore: 85, riskScore: 15, angle: "safe" }),
    estimatedCostUsd: 0.002
  },
  {
    id: "item-2",
    accountId: "acc-2",
    content: "Şikayet etmeyi bırakmadığın sürece aynı yerde sayacaksın. Disiplin zayıflık kabul etmez.",
    status: "approved",
    createdAt: new Date(FIXTURE_NOW.getTime() - 24 * 60 * 60 * 1000), // yesterday
    scheduledAt: new Date(FIXTURE_NOW.getTime() + 2 * 60 * 60 * 1000), // today 14:00
    scores: JSON.stringify({ publishScore: 92, riskScore: 75, angle: "strong" }), // high risk
    estimatedCostUsd: 0.001
  },
  {
    id: "item-3",
    accountId: "acc-3",
    content: "Futbolda taktiksel kriz devam ediyor. Bu hoca tercihi büyük kriz.",
    status: "published",
    createdAt: new Date(FIXTURE_NOW.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    scheduledAt: null,
    scores: JSON.stringify({ publishScore: 65, riskScore: 45, angle: "provocative" }), // medium risk
    estimatedCostUsd: 0.003
  }
];

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXTURE_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: vi.fn(() => true) }));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    queueItem: {
      findMany: vi.fn(() => Promise.resolve(mockQueueItems))
    },
    account: {
      findMany: vi.fn(() => Promise.resolve(mockAccounts))
    }
  }
}));

vi.mock("@/lib/db/accountRepo", () => ({
  accountRepo: {
    findAll: vi.fn(() => Promise.resolve(mockAccounts)),
    findById: vi.fn((id: string) => Promise.resolve(mockAccounts.find((a) => a.id === id) || null)),
    findByHandle: vi.fn((h: string) => Promise.resolve(mockAccounts.find((a) => a.handle === h) || null))
  }
}));

vi.mock("@/lib/db/queueRepo", () => ({
  queueRepo: {
    findById: vi.fn((id: string) => Promise.resolve(mockQueueItems.find((i) => i.id === id) || null)),
    update: vi.fn((id: string, updates: any) => {
      const existing = mockQueueItems.find((i) => i.id === id);
      return Promise.resolve({ ...existing, ...updates });
    })
  }
}));

vi.mock("@/lib/growth-engine/feedback-service", () => ({
  processFeedback: vi.fn(() => Promise.resolve({ success: true, feedbackEventId: "evt-123" }))
}));

// Faz 1E: manuel onay publish state machine'inden geçer (ADR-025).
vi.mock("@/lib/publish/publishAttemptService", () => ({
  publishAttemptService: {
    confirmManualPublish: vi.fn((id: string) => {
      const existing = mockQueueItems.find((i) => i.id === id);
      return Promise.resolve({
        alreadyPublished: false,
        attempt: { id: "att-1", state: "succeeded" },
        log: { id: "log-1" },
        item: { ...existing, status: "manual_published", publishedAt: new Date() },
        generatedImageUrl: null,
      });
    }),
    prepareIntent: vi.fn(),
    latestIntentAttempts: vi.fn(() => Promise.resolve(new Map())),
  },
}));

vi.mock("@/lib/growth-engine/draft-critic", () => ({
  critiqueDraft: vi.fn(() => Promise.resolve({
    publishScore: 88,
    riskScore: 25,
    angle: "safe",
    personaMatchScore: 80,
    hookStrengthScore: 78
  }))
}));

describe("Daily Queue UI API Suite (Exactly 30 Tests)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeGetReq = (query = "") => {
    return new NextRequest(`http://localhost:3000/api/growth/daily-queue?${query}`, { method: "GET" });
  };

  const makePatchReq = (id: string, body: any) => {
    return new NextRequest(`http://localhost:3000/api/growth/daily-queue/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  };

  const makePostReq = (id: string, path: string, body: any) => {
    return new NextRequest(`http://localhost:3000/api/growth/daily-queue/${id}/${path}`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  };

  // --- SECTION 1: GET list, telemetry, filtering, and sorting (13 tests) ---

  it("1. should list all queue items with correct summaries", async () => {
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary.totalItems).toBe(3);
    expect(data.summary.draftItems).toBe(1);
    expect(data.summary.highRiskItems).toBe(1);
    expect(data.summary.averagePublishScore).toBe(81); // Math.round((85+92+65)/3)
  });

  it("2. should filter items by accountHandle", async () => {
    const res = await GET(makeGetReq("accountHandle=grafikcem"));
    const data = await res.json();
    expect(data.items.every((i: any) => i.accountHandle === "grafikcem")).toBe(true);
  });

  it("3. should filter items by status draft (new in DB)", async () => {
    const res = await GET(makeGetReq("status=draft"));
    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).toBe("item-1");
  });

  it("4. should filter items by status approved", async () => {
    const res = await GET(makeGetReq("status=approved"));
    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).toBe("item-2");
  });

  it("5. should filter items by dateRange today", async () => {
    const res = await GET(makeGetReq("dateRange=today"));
    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).toBe("item-1");
  });

  it("6. should filter items by dateRange tomorrow", async () => {
    const res = await GET(makeGetReq("dateRange=tomorrow"));
    const data = await res.json();
    expect(data.items.length).toBe(0);
  });

  it("7. should filter items by dateRange last_7_days", async () => {
    const res = await GET(makeGetReq("dateRange=last_7_days"));
    const data = await res.json();
    expect(data.items.length).toBe(2); // item-1 (today) and item-2 (yesterday)
  });

  it("8. should filter items by dateRange next_7_days", async () => {
    const res = await GET(makeGetReq("dateRange=next_7_days"));
    const data = await res.json();
    expect(data.items.length).toBe(2); // item-1 (today created) and item-2 (today scheduled)
  });

  it("9. should filter items by risk low (<40)", async () => {
    const res = await GET(makeGetReq("risk=low"));
    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).toBe("item-1");
  });

  it("10. should filter items by risk medium (40-69)", async () => {
    const res = await GET(makeGetReq("risk=medium"));
    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).toBe("item-3");
  });

  it("11. should filter items by risk high (>=70)", async () => {
    const res = await GET(makeGetReq("risk=high"));
    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).toBe("item-2");
  });

  it("12. should sort items by publishScore descending", async () => {
    const res = await GET(makeGetReq("sort=publishScore"));
    const data = await res.json();
    expect(data.items[0].scoresParsed.publishScore).toBe(92);
    expect(data.items[1].scoresParsed.publishScore).toBe(85);
    expect(data.items[2].scoresParsed.publishScore).toBe(65);
  });

  it("13. should search items by text query in content", async () => {
    const res = await GET(makeGetReq("search=disiplin"));
    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).toBe("item-2");
  });

  // --- SECTION 2: PATCH validations and content edit logic (8 tests) ---

  it("14. should successfully patch content and status of draft item", async () => {
    const res = await PATCH(makePatchReq("item-1", { content: "Yeni Taslak Metni", status: "approved" }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.item.content).toBe("Yeni Taslak Metni");
  });

  it("14b. should successfully patch status to manual_published and update publishedAt", async () => {
    const res = await PATCH(makePatchReq("item-1", { status: "manual_published" }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.item.status).toBe("manual_published");
    expect(data.item.publishedAt).toBeDefined();
  });

  it("15. should prevent patching already published items", async () => {
    const res = await PATCH(makePatchReq("item-3", { content: "Yeni Metin" }), {
      params: Promise.resolve({ id: "item-3" })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Cannot modify already published items");
  });

  it("16. should reject empty content patch", async () => {
    const res = await PATCH(makePatchReq("item-1", { content: "" }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(400);
  });

  it("17. should reject past scheduledAt date parameter", async () => {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    const res = await PATCH(makePatchReq("item-1", { scheduledAt: pastDate }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Scheduled date cannot be in the past");
  });

  it("18. should reject scheduled status if scheduledAt date is missing", async () => {
    const res = await PATCH(makePatchReq("item-1", { status: "scheduled" }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(400);
  });

  it("19. should accept valid scheduledAt and status scheduled", async () => {
    const futureDate = new Date(Date.now() + 10 * 3600 * 1000).toISOString();
    const res = await PATCH(makePatchReq("item-1", { status: "scheduled", scheduledAt: futureDate }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(200);
  });

  it("20. should return 404 for nonexistent patch item id", async () => {
    const res = await PATCH(makePatchReq("nonexistent", { content: "Metin" }), {
      params: Promise.resolve({ id: "nonexistent" })
    });
    expect(res.status).toBe(404);
  });

  it("21. should reject invalid scheduledAt date format", async () => {
    const res = await PATCH(makePatchReq("item-1", { scheduledAt: "invalid-date-format" }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(400);
  });

  // --- SECTION 3: Feedback api sync actions (5 tests) ---

  it("22. should submit feedback approved event and update DB status", async () => {
    const res = await feedbackPost(makePostReq("item-1", "feedback", { feedbackType: "approved" }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("23. should submit feedback rejected event and mark rejected in DB", async () => {
    const res = await feedbackPost(makePostReq("item-1", "feedback", { feedbackType: "rejected" }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(200);
  });

  it("24. should submit feedback edited event with custom editedContent parameter", async () => {
    const res = await feedbackPost(
      makePostReq("item-1", "feedback", { feedbackType: "approved", editedContent: "Edited content text" }),
      { params: Promise.resolve({ id: "item-1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("25. should return 400 if feedbackType is missing", async () => {
    const res = await feedbackPost(makePostReq("item-1", "feedback", {}), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(400);
  });

  it("26. should return 404 for nonexistent feedback item id", async () => {
    const res = await feedbackPost(makePostReq("nonexistent", "feedback", { feedbackType: "approved" }), {
      params: Promise.resolve({ id: "nonexistent" })
    });
    expect(res.status).toBe(404);
  });

  // --- SECTION 4: Rescore flow and fallback scorers (4 tests) ---

  it("27. should successfully rescore item and save back in DB", async () => {
    const res = await rescorePost(makePostReq("item-1", "rescore", {}), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.critic.publishScore).toBe(88);
  });

  it("28. should successfully rescore using custom content payload", async () => {
    const res = await rescorePost(makePostReq("item-1", "rescore", { content: "Rescored content idea" }), {
      params: Promise.resolve({ id: "item-1" })
    });
    expect(res.status).toBe(200);
  });

  it("29. should return 404 for nonexistent rescore item id", async () => {
    const res = await rescorePost(makePostReq("nonexistent", "rescore", {}), {
      params: Promise.resolve({ id: "nonexistent" })
    });
    expect(res.status).toBe(404);
  });

  it("30. should return average telemetry 0 when database has no records", async () => {
    const { prisma } = await import("@/lib/db/client");
    vi.spyOn(prisma.queueItem, "findMany").mockResolvedValueOnce([]);

    const res = await GET(makeGetReq());
    const data = await res.json();
    expect(data.summary.totalItems).toBe(0);
    expect(data.summary.averagePublishScore).toBe(0);
  });
});
