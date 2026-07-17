 
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma client
vi.mock("@/lib/db/client", () => ({
  prisma: {
    queueItem: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    publishLog: {
      count: vi.fn(),
    },
  },
}));

// Mock qualityLintService
vi.mock("@/lib/services/qualityLintService", () => ({
  qualityLintService: {
    lint: vi.fn(),
  },
}));

// Mock draftService
vi.mock("@/lib/services/draftService", () => ({
  draftService: {
    generateDraft: vi.fn(),
  },
}));

import { prisma } from "@/lib/db/client";
import { qualityLintService } from "@/lib/services/qualityLintService";
import { scheduleService, isWithinQuietHours, parseSlotKey } from "./scheduleService";

describe("scheduleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isWithinQuietHours", () => {
    it("should return false when start equals end", () => {
      const d = new Date("2026-05-20T12:00:00");
      expect(isWithinQuietHours(d, 23, 23)).toBe(false);
    });

    it("should handle quiet hours on same day", () => {
      const d1 = new Date("2026-05-20T15:00:00"); // 15:00
      const d2 = new Date("2026-05-20T20:00:00"); // 20:00
      expect(isWithinQuietHours(d1, 14, 18)).toBe(true);
      expect(isWithinQuietHours(d2, 14, 18)).toBe(false);
    });

    it("should handle quiet hours crossing midnight", () => {
      const d1 = new Date("2026-05-20T01:00:00"); // 01:00
      const d2 = new Date("2026-05-20T23:30:00"); // 23:30
      const d3 = new Date("2026-05-20T12:00:00"); // 12:00
      expect(isWithinQuietHours(d1, 23, 8)).toBe(true);
      expect(isWithinQuietHours(d2, 23, 8)).toBe(true);
      expect(isWithinQuietHours(d3, 23, 8)).toBe(false);
    });
  });

  describe("parseSlotKey", () => {
    const base = new Date("2026-05-20T10:00:00");

    it("should parse 15 dk correctly", () => {
      const target = parseSlotKey("15 dk", base);
      expect(target.getMinutes()).toBe(15);
    });

    it("should parse 1 saat correctly", () => {
      const target = parseSlotKey("1 saat", base);
      expect(target.getHours()).toBe(11);
    });

    it("should parse yarın 09:00 correctly", () => {
      const target = parseSlotKey("yarın 09:00", base);
      expect(target.getDate()).toBe(21);
      expect(target.getHours()).toBe(9);
      expect(target.getMinutes()).toBe(0);
    });

    it("should throw for invalid slot key", () => {
      expect(() => parseSlotKey("invalid")).toThrow();
    });
  });

  describe("approve", () => {
    it("should fail if item not found", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(null as any);
      await expect(scheduleService.approve("qi_123")).rejects.toThrow("queue_item_not_found");
    });

    it("should fail if already published or rejected", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({ id: "qi_1", status: "published" } as any);
      await expect(scheduleService.approve("qi_1")).rejects.toThrow("invalid_status");
    });

    it("should fail if content is empty", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        id: "qi_1",
        status: "new",
        content: "",
        editedContent: null,
      } as any);
      await expect(scheduleService.approve("qi_1")).rejects.toThrow("empty_content");
    });

    it("should fail if lint fails", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        id: "qi_1",
        status: "new",
        content: "test text",
        editedContent: null,
        draftType: "TWEET",
        account: { maxChars: 280 },
      } as any);
      vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: false, blockers: ["Hata"], warnings: [], issues: [], checkedAt: "", source: { deterministic: true, llm: false } });

      await expect(scheduleService.approve("qi_1")).rejects.toThrow("lint_blocked");
    });

    it("should succeed and set status approved for clean content", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        id: "qi_1",
        status: "new",
        content: "Temiz içerik",
        editedContent: null,
        draftType: "TWEET",
        account: { maxChars: 280 },
      } as any);
      vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: true, blockers: [], warnings: [], issues: [], checkedAt: "", source: { deterministic: true, llm: false } });
      vi.mocked(prisma.queueItem.update).mockResolvedValue({ id: "qi_1", status: "approved" } as any);

      const res = await scheduleService.approve("qi_1");
      expect(res.status).toBe("approved");
      expect(prisma.queueItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "qi_1" },
          data: expect.objectContaining({
            status: "approved",
          }),
        })
      );
    });
  });

  describe("reject", () => {
    it("should succeed and update status to rejected", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({ id: "qi_1", status: "new" } as any);
      vi.mocked(prisma.queueItem.update).mockResolvedValue({ id: "qi_1", status: "rejected" } as any);

      const res = await scheduleService.reject("qi_1");
      expect(res.status).toBe("rejected");
    });

    it("should fail if status is published", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({ id: "qi_1", status: "published" } as any);
      await expect(scheduleService.reject("qi_1")).rejects.toThrow("invalid_status");
    });
  });

  describe("scheduleDraft", () => {
    it("should fail if scheduled in the past or < 60s future", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        id: "qi_1",
        status: "new",
        content: "İçerik",
        editedContent: null,
        draftType: "TWEET",
        account: { maxChars: 280, schedule: null },
      } as any);

      const past = new Date(Date.now() - 1000);
      await expect(scheduleService.scheduleDraft("qi_1", past)).rejects.toThrow("past_date");

      const tooSoon = new Date(Date.now() + 10 * 1000); // 10s future
      await expect(scheduleService.scheduleDraft("qi_1", tooSoon)).rejects.toThrow("past_date");
    });

    it("should fail if lint fails", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        id: "qi_1",
        status: "new",
        content: "İçerik",
        editedContent: null,
        draftType: "TWEET",
        account: { maxChars: 280, schedule: null },
      } as any);
      vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: false, blockers: ["Hata"], warnings: [], issues: [], checkedAt: "", source: { deterministic: true, llm: false } });

      const future = new Date(Date.now() + 10 * 60 * 1000);
      await expect(scheduleService.scheduleDraft("qi_1", future)).rejects.toThrow("lint_blocked");
    });

    it("should fail if character limit is exceeded", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        id: "qi_1",
        status: "new",
        content: "a".repeat(300),
        editedContent: null,
        draftType: "TWEET",
        account: { maxChars: 280, schedule: null },
      } as any);
      vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: true, blockers: [], warnings: [], issues: [], checkedAt: "", source: { deterministic: true, llm: false } });

      const future = new Date(Date.now() + 10 * 60 * 1000);
      await expect(scheduleService.scheduleDraft("qi_1", future)).rejects.toThrow("char_limit");
    });

    it("should fail if schedule quiet hours are active", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        id: "qi_1",
        status: "new",
        content: "İçerik",
        editedContent: null,
        draftType: "TWEET",
        account: {
          maxChars: 280,
          schedule: {
            quietStartHour: 23,
            quietEndHour: 8,
            dailyMaxPosts: 3,
          },
        },
      } as any);
      vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: true, blockers: [], warnings: [], issues: [], checkedAt: "", source: { deterministic: true, llm: false } });

      // Target is 11:30 PM (23:30) which is quiet hour
      const target = new Date();
      target.setDate(target.getDate() + 1);
      target.setHours(23, 30, 0, 0);

      await expect(scheduleService.scheduleDraft("qi_1", target)).rejects.toThrow("quiet_hours_active");
    });

    it("should fail if daily cap is reached", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        id: "qi_1",
        status: "new",
        content: "İçerik",
        editedContent: null,
        draftType: "TWEET",
        accountId: "acc_1",
        account: {
          maxChars: 280,
          schedule: {
            quietStartHour: 23,
            quietEndHour: 8,
            dailyMaxPosts: 3,
          },
        },
      } as any);
      vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: true, blockers: [], warnings: [], issues: [], checkedAt: "", source: { deterministic: true, llm: false } });

      // Mock daily count: 2 published logs + 1 scheduled item = 3 posts (cap reached)
      vi.mocked(prisma.publishLog.count).mockResolvedValue(2);
      vi.mocked(prisma.queueItem.count).mockResolvedValue(1);

      const target = new Date();
      target.setDate(target.getDate() + 1);
      target.setHours(14, 0, 0, 0); // 2:00 PM (not quiet hour)

      await expect(scheduleService.scheduleDraft("qi_1", target)).rejects.toThrow("daily_cap_reached");
    });

    it("should succeed and persist on clean conditions", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
        id: "qi_1",
        status: "new",
        content: "Temiz içerik",
        editedContent: null,
        draftType: "TWEET",
        accountId: "acc_1",
        account: {
          maxChars: 280,
          schedule: {
            quietStartHour: 23,
            quietEndHour: 8,
            dailyMaxPosts: 3,
          },
        },
      } as any);
      vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: true, blockers: [], warnings: [], issues: [], checkedAt: "", source: { deterministic: true, llm: false } });
      vi.mocked(prisma.publishLog.count).mockResolvedValue(0);
      vi.mocked(prisma.queueItem.count).mockResolvedValue(0);
      vi.mocked(prisma.queueItem.update).mockResolvedValue({ id: "qi_1", status: "scheduled" } as any);

      const target = new Date();
      target.setDate(target.getDate() + 1);
      target.setHours(14, 0, 0, 0);

      const res = await scheduleService.scheduleDraft("qi_1", target);
      expect(res.status).toBe("scheduled");
      expect(prisma.queueItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "qi_1" },
          data: expect.objectContaining({
            status: "scheduled",
            scheduledAt: target,
          }),
        })
      );
    });
  });

  describe("deleteDraft", () => {
    it("should allow deleting unpublished items", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({ id: "qi_1", status: "new" } as any);
      vi.mocked(prisma.queueItem.delete).mockResolvedValue({ id: "qi_1", status: "deleted" } as any);

      const res = await scheduleService.deleteDraft("qi_1");
      expect(res).toBeDefined();
      expect(prisma.queueItem.delete).toHaveBeenCalledWith({ where: { id: "qi_1" } });
    });

    it("should refuse deleting published items", async () => {
      vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({ id: "qi_1", status: "published" } as any);
      await expect(scheduleService.deleteDraft("qi_1")).rejects.toThrow("published_delete_refused");
    });
  });
});


// ─── Phase 2D (ADR-033): thread approve/schedule parity ───────────────────────

const T_SEGS = [
  { text: "Hook segmenti: arac dokumu geliyor." },
  { text: "Adim 1: kur ve preset kilitle." },
  { text: "Payoff: kaydet." },
];
const T_JOINED = T_SEGS.map((s) => s.text).join("\n\n");

function threadDbItem(over: Record<string, unknown> = {}) {
  return {
    id: "qi_t",
    accountId: "acc_1",
    status: "new",
    content: T_JOINED,
    editedContent: null,
    draftType: "THREAD",
    mode: "thread",
    scores: JSON.stringify({ telemetry: { judged: true }, turkishNaturalness: 85, riskScore: 10, sourceFaithfulness: 90, leaks: [] }),
    lintReport: null,
    threadSegments: JSON.stringify(T_SEGS),
    sourcePostId: "sp_1",
    newsItemId: null,
    scheduledAt: null,
    approvedAt: null,
    account: { id: "acc_1", handle: "grafikcem", maxChars: 280, schedule: null },
    ...over,
  };
}

describe("Phase 2D — thread approve/schedule parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approve: toplam birleşik uzunluk 280'i aşsa da segmentler uygunsa KABUL (joined lint koşulmaz)", async () => {
    expect(T_JOINED.length).toBeGreaterThan(80); // birleşik metin tek tweet değil
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(threadDbItem() as any);
    vi.mocked(prisma.queueItem.update).mockResolvedValue({ id: "qi_t", status: "approved" } as any);

    const res = await scheduleService.approve("qi_t");
    expect(res.status).toBe("approved");
    expect(qualityLintService.lint).not.toHaveBeenCalled(); // birleşik lint yolu thread'de kapalı
  });

  it("approve: tek oversized segment → readiness_not_ready (fail-closed)", async () => {
    const over = [{ text: "y".repeat(300) }, { text: "kapanis" }];
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(
      threadDbItem({ threadSegments: JSON.stringify(over), content: over.map((s) => s.text).join("\n\n") }) as any,
    );
    await expect(scheduleService.approve("qi_t")).rejects.toThrow("readiness_not_ready");
    expect(prisma.queueItem.update).not.toHaveBeenCalled();
  });

  it("approve: segmentsiz (structureless) thread → readiness_not_ready", async () => {
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(threadDbItem({ threadSegments: null }) as any);
    await expect(scheduleService.approve("qi_t")).rejects.toThrow("readiness_not_ready");
  });

  it("scheduleDraft: thread birleşik uzunluk 280'i aşsa da segmentler uygunsa kabul; char_limit atılmaz", async () => {
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(threadDbItem() as any);
    vi.mocked(prisma.publishLog.count).mockResolvedValue(0);
    vi.mocked(prisma.queueItem.count).mockResolvedValue(0);
    vi.mocked(prisma.queueItem.update).mockResolvedValue({ id: "qi_t", status: "scheduled" } as any);

    const future = new Date(Date.now() + 60 * 60 * 1000);
    future.setHours(12, 0, 0, 0);
    future.setDate(future.getDate() + 1);
    const res = await scheduleService.scheduleDraft("qi_t", future);
    expect(res.status).toBe("scheduled");
    expect(qualityLintService.lint).not.toHaveBeenCalled();
  });

  it("scheduleDraft: readiness ready değilse (judged=false) fail-closed", async () => {
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(
      threadDbItem({ scores: JSON.stringify({ telemetry: { judged: false } }) }) as any,
    );
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await expect(scheduleService.scheduleDraft("qi_t", future)).rejects.toThrow("readiness_not_ready");
  });

  it("non-thread scheduleDraft char limit davranışı KORUNDU", async () => {
    vi.mocked(prisma.queueItem.findUnique).mockResolvedValue({
      id: "qi_1",
      status: "new",
      content: "z".repeat(300),
      editedContent: null,
      draftType: "TWEET",
      mode: "ai_news",
      account: { maxChars: 280, schedule: null },
    } as any);
    vi.mocked(qualityLintService.lint).mockResolvedValue({ passed: true, blockers: [], warnings: [], issues: [], checkedAt: "", source: { deterministic: true, llm: false } } as any);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await expect(scheduleService.scheduleDraft("qi_1", future)).rejects.toThrow("char_limit");
  });
});
