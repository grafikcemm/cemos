import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * consume-plan route sözleşmesi (ADR-039 §8) — route seviyesinde mocked prisma +
 * handoff service:
 *  - ay-gün doğrulama (Şubat 30 → invalid_day)
 *  - plan archived → plan_archived
 *  - gün dolu → day_occupied; boş assembler slotu → reuse (create YOK)
 *  - boş gün → create; already consumed → idempotent
 *  - slot yazımı consume ile aynı transaction (advisory-lock)
 */

const txMock = {
  $queryRaw: vi.fn(() => Promise.resolve([])),
  reelPlanSlot: {
    findMany: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({ id: "new-slot" })),
    update: vi.fn(() => Promise.resolve({ id: "reused-slot" })),
  },
  opportunityHandoff: {
    findFirst: vi.fn(() => Promise.resolve(null)),
    update: vi.fn(() => Promise.resolve({})),
  },
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    reelPlan: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/utils/sameOriginGuard", () => ({ isOperatorOrCronAuthorized: () => true }));

import { prisma } from "@/lib/db/client";
import { opportunityHandoffService } from "@/lib/services/opportunityHandoffService";
import { POST } from "./route";

const ACC = "acc-1";
const mockPlanFind = vi.mocked(prisma.reelPlan.findUnique);

function handoff(overrides: Record<string, unknown> = {}) {
  return {
    id: "h1",
    accountId: ACC,
    action: "plan",
    status: "pending",
    title: "Fırsat başlığı",
    topicSeed: "konu",
    resultRef: null,
    ...overrides,
  };
}

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/opportunities/handoff/h1/consume-plan", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "h1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  txMock.$queryRaw.mockResolvedValue([]);
  txMock.reelPlanSlot.findMany.mockResolvedValue([]);
  txMock.opportunityHandoff.findFirst.mockResolvedValue(null);
  vi.spyOn(opportunityHandoffService, "getById").mockResolvedValue(handoff() as never);
  vi.spyOn(opportunityHandoffService, "consume").mockResolvedValue({
    alreadyConsumed: false,
    handoff: handoff({ status: "consumed" }),
  } as never);
});

describe("consume-plan sözleşmesi", () => {
  it("Şubat 30 → invalid_day", async () => {
    mockPlanFind.mockResolvedValue({ id: "plan-1", status: "draft" } as never);
    const res = await POST(req({ month: "2026-02", dayOfMonth: 30 }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("invalid_day");
  });

  it("plan yok → plan_not_found", async () => {
    mockPlanFind.mockResolvedValue(null as never);
    const res = await POST(req({ month: "2026-08", dayOfMonth: 10 }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("plan_not_found");
  });

  it("archived plan → plan_archived", async () => {
    mockPlanFind.mockResolvedValue({ id: "plan-1", status: "archived" } as never);
    const res = await POST(req({ month: "2026-08", dayOfMonth: 10 }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("plan_archived");
  });

  it("boş gün → yeni slot oluşturur (201)", async () => {
    mockPlanFind.mockResolvedValue({ id: "plan-1", status: "draft" } as never);
    txMock.reelPlanSlot.findMany.mockResolvedValue([]);
    const res = await POST(req({ month: "2026-08", dayOfMonth: 10 }), ctx);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.reused).toBe(false);
    expect(txMock.reelPlanSlot.create).toHaveBeenCalled();
  });

  it("boş assembler slotu varsa REUSE eder (create YOK)", async () => {
    mockPlanFind.mockResolvedValue({ id: "plan-1", status: "draft" } as never);
    txMock.reelPlanSlot.findMany.mockResolvedValue([
      { id: "free-slot", status: "planned", dossierId: null },
    ] as never);
    txMock.opportunityHandoff.findFirst.mockResolvedValue(null); // başka handoff'a ait değil
    const res = await POST(req({ month: "2026-08", dayOfMonth: 10 }), ctx);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.reused).toBe(true);
    expect(json.slotId).toBe("free-slot");
    expect(txMock.reelPlanSlot.create).not.toHaveBeenCalled();
    expect(txMock.reelPlanSlot.update).toHaveBeenCalled();
  });

  it("gün dolu (drafted/dossier) → day_occupied", async () => {
    mockPlanFind.mockResolvedValue({ id: "plan-1", status: "draft" } as never);
    txMock.reelPlanSlot.findMany.mockResolvedValue([
      { id: "busy", status: "drafted", dossierId: "d1" },
    ] as never);
    const res = await POST(req({ month: "2026-08", dayOfMonth: 10 }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("day_occupied");
  });

  it("boş slot başka handoff'a aitse gasp etmez → day_occupied", async () => {
    mockPlanFind.mockResolvedValue({ id: "plan-1", status: "draft" } as never);
    txMock.reelPlanSlot.findMany.mockResolvedValue([
      { id: "others", status: "planned", dossierId: null },
    ] as never);
    txMock.opportunityHandoff.findFirst.mockResolvedValue({ id: "other-handoff" } as never);
    const res = await POST(req({ month: "2026-08", dayOfMonth: 10 }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("day_occupied");
  });

  it("already consumed → idempotent 200", async () => {
    vi.spyOn(opportunityHandoffService, "getById").mockResolvedValue(
      handoff({ status: "consumed", resultRef: "existing" }) as never
    );
    const res = await POST(req({ month: "2026-08", dayOfMonth: 10 }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadyConsumed).toBe(true);
    expect(json.slotId).toBe("existing");
  });
});
