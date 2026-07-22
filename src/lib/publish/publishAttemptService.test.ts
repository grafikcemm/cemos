import { describe, it, expect, vi, beforeEach } from "vitest";
import { publishAttemptService, contentHashOf, canonicalPublicationOf } from "./publishAttemptService";
import { threadPublicationHashInput } from "@/lib/growth-engine/threadSegments";
import { PublishFlowError } from "./contract";
import { xApiPublishAdapter } from "./xApiAdapter";
import { intentPublishAdapter } from "./intentAdapter";
import { prisma } from "@/lib/db/client";

/**
 * Faz 1E (ADR-025) — publish state machine geçiş matrisi. Readiness GERÇEK
 * assessReadiness ile koşar (fail-closed sözleşme mock'lanmaz); DB mock.
 */

const tx = {
  publishAttempt: { updateMany: vi.fn(), create: vi.fn() },
  queueItem: { update: vi.fn() },
  publishLog: { create: vi.fn() },
  publishedPost: { create: vi.fn() },
  usageLog: { create: vi.fn() },
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    queueItem: { findUnique: vi.fn(), update: vi.fn() },
    publishAttempt: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    publishLog: { create: vi.fn() },
    publishedPost: { create: vi.fn() },
    usageLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/growth-engine/feedback-service", () => ({
  processFeedback: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/services/imageService", () => ({
  imageService: { generateForQueueItem: vi.fn(() => Promise.resolve(null)) },
}));

// Ready = judged + TR doğallık + düşük risk + sızıntı yok + sınır içi.
const readyScores = JSON.stringify({
  telemetry: { judged: true },
  turkishNaturalness: 82,
  riskScore: 15,
  sourceFaithfulness: 88,
  leaks: [],
});

const READY_TEXT = "Temiz taslak — sahada test ettigim araci anlattim.";

const readyItem = {
  id: "qi_1",
  accountId: "acc_1",
  content: READY_TEXT,
  editedContent: null as string | null,
  draftType: "TWEET",
  mode: "default",
  status: "scheduled",
  scheduledAt: null as Date | null,
  publishedAt: null as Date | null,
  generatedImageUrl: null as string | null,
  scores: readyScores,
  lintReport: null,
  threadSegments: null,
  sourcePostId: null,
  newsItemId: null,
  account: { id: "acc_1", handle: "grafikcem", maxChars: 280 },
};

const READY_HASH = contentHashOf(READY_TEXT);

function preparedAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "att_1",
    queueItemId: "qi_1",
    accountId: "acc_1",
    adapter: "intent",
    state: "prepared",
    idempotencyKey: `qi_1:${READY_HASH.slice(0, 24)}`,
    contentHash: READY_HASH,
    readinessPolicyVersion: "1.0.0-provisional",
    readinessSnapshotJson: "{}",
    externalId: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date("2026-07-16T08:00:00Z"),
    updatedAt: new Date("2026-07-16T08:00:00Z"),
    completedAt: null,
    ...overrides,
  };
}

function mockItem(item: unknown) {
  vi.mocked(prisma.queueItem.findUnique).mockResolvedValue(
    item as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>,
  );
}

async function expectFlowError(p: Promise<unknown>, code: string) {
  try {
    await p;
    expect.unreachable(`beklenen hata: ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(PublishFlowError);
    expect((err as PublishFlowError).code).toBe(code);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction: interactive callback'i tx mock'uyla çalıştır.
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
    (fn as (t: typeof tx) => Promise<unknown>)(tx),
  );
  tx.publishAttempt.updateMany.mockResolvedValue({ count: 1 });
  tx.publishAttempt.create.mockImplementation(async (args: { data: Record<string, unknown> }) =>
    preparedAttempt(args.data),
  );
  tx.queueItem.update.mockResolvedValue({
    ...readyItem,
    status: "manual_published",
    publishedAt: new Date(),
  });
  tx.publishLog.create.mockResolvedValue({ id: "log_1" });
  tx.publishedPost.create.mockResolvedValue({ id: "pp_1" });
  tx.usageLog.create.mockResolvedValue({ id: "ul_1" });
});

describe("prepareIntent", () => {
  it("ready taslak → PublishAttempt(prepared) + intent URL; yayın state'i OLUŞMAZ", async () => {
    mockItem(readyItem);
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue(null);

    const res = await publishAttemptService.prepareIntent("qi_1");

    expect(res.attempt.state).toBe("prepared");
    expect(res.intentUrl).toContain("https://x.com/intent/post?text=");
    expect(res.reused).toBe(false);
    // Intent = yalnız prepared: QueueItem/PublishLog/PublishedPost/UsageLog YOK.
    expect(tx.queueItem.update).not.toHaveBeenCalled();
    expect(tx.publishLog.create).not.toHaveBeenCalled();
    expect(tx.publishedPost.create).not.toHaveBeenCalled();
    expect(tx.usageLog.create).not.toHaveBeenCalled();
    expect(prisma.queueItem.update).not.toHaveBeenCalled();
  });

  it("needs_edit (judged=false) → edit_required; attempt YARATILMAZ", async () => {
    mockItem({ ...readyItem, scores: "{}" });
    await expectFlowError(publishAttemptService.prepareIntent("qi_1"), "edit_required");
    expect(tx.publishAttempt.create).not.toHaveBeenCalled();
  });

  it("blocked (karakter sınırı aşımı) → readiness_blocked; attempt YARATILMAZ", async () => {
    mockItem({ ...readyItem, content: "x".repeat(300) });
    await expectFlowError(publishAttemptService.prepareIntent("qi_1"), "readiness_blocked");
    expect(tx.publishAttempt.create).not.toHaveBeenCalled();
  });

  it("aynı eylemin retry'ı duplicate üretmez — mevcut prepared idempotent döner", async () => {
    mockItem(readyItem);
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue(
      preparedAttempt() as Awaited<ReturnType<typeof prisma.publishAttempt.findUnique>>,
    );

    const res = await publishAttemptService.prepareIntent("qi_1");
    expect(res.reused).toBe(true);
    expect(res.attempt.id).toBe("att_1");
    expect(tx.publishAttempt.create).not.toHaveBeenCalled();
  });

  it("içerik değişince yeni hazırlık öncekini superseded yapar", async () => {
    mockItem({ ...readyItem, editedContent: "Yeni metin — düzenlendi, araci sahada test ettim." });
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue(null);

    await publishAttemptService.prepareIntent("qi_1");

    expect(tx.publishAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { queueItemId: "qi_1", adapter: "intent", state: "prepared" },
        data: expect.objectContaining({ state: "failed", errorCode: "superseded" }),
      }),
    );
    expect(tx.publishAttempt.create).toHaveBeenCalled();
  });

  it("yayınlanmış taslak yeniden hazırlanamaz → already_published", async () => {
    mockItem({ ...readyItem, status: "manual_published" });
    await expectFlowError(publishAttemptService.prepareIntent("qi_1"), "already_published");
  });
});

describe("confirmManualPublish", () => {
  it("prepared → succeeded: attempt+QueueItem+PublishLog+PublishedPost+UsageLog TEK transaction'da", async () => {
    mockItem(readyItem);
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(
      preparedAttempt() as Awaited<ReturnType<typeof prisma.publishAttempt.findFirst>>,
    );

    const res = await publishAttemptService.confirmManualPublish("qi_1");

    expect(res.alreadyPublished).toBe(false);
    expect(res.log?.id).toBe("log_1");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // TÜM yayın yazımları tx client üzerinden (root prisma DEĞİL).
    expect(tx.publishAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att_1", state: "prepared" },
        data: expect.objectContaining({ state: "succeeded" }),
      }),
    );
    expect(tx.queueItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "manual_published" }) }),
    );
    expect(tx.publishLog.create).toHaveBeenCalledTimes(1);
    expect(tx.publishedPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ draftQueueItemId: "qi_1", platform: "x" }),
      }),
    );
    expect(tx.usageLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.publishLog.create).not.toHaveBeenCalled();
    expect(prisma.publishedPost.create).not.toHaveBeenCalled();
  });

  it("hazırlık yoksa reddedilir → prepare_not_found (doğrudan bypass edilemez)", async () => {
    mockItem(readyItem);
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(null);
    await expectFlowError(publishAttemptService.confirmManualPublish("qi_1"), "prepare_not_found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stale contentHash reddedilir → content_changed (yeniden X'te aç)", async () => {
    mockItem({ ...readyItem, editedContent: "Metin hazırlıktan SONRA değişti, yeniden yazdım." });
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(
      preparedAttempt() as Awaited<ReturnType<typeof prisma.publishAttempt.findFirst>>,
    );
    await expectFlowError(publishAttemptService.confirmManualPublish("qi_1"), "content_changed");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("onay anında ready değilse reddedilir → edit_required (readiness yeniden koşar)", async () => {
    // Metin aynı (hash tutar) ama judge sinyali kayboldu → fail-closed needs_edit.
    mockItem({ ...readyItem, scores: "{}" });
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(
      preparedAttempt() as Awaited<ReturnType<typeof prisma.publishAttempt.findFirst>>,
    );
    await expectFlowError(publishAttemptService.confirmManualPublish("qi_1"), "edit_required");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("yanlış hesap/queue eşleşmesi reddedilir → account_mismatch", async () => {
    mockItem(readyItem);
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue(
      preparedAttempt({ id: "att_other", accountId: "acc_BAŞKA" }) as Awaited<
        ReturnType<typeof prisma.publishAttempt.findUnique>
      >,
    );
    await expectFlowError(
      publishAttemptService.confirmManualPublish("qi_1", { attemptId: "att_other" }),
      "account_mismatch",
    );
  });

  it("tekrarlanan onay idempotent — duplicate PublishLog/PublishedPost/UsageLog YOK", async () => {
    mockItem({ ...readyItem, status: "manual_published" });
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(
      preparedAttempt({ state: "succeeded", completedAt: new Date() }) as Awaited<
        ReturnType<typeof prisma.publishAttempt.findFirst>
      >,
    );

    const res = await publishAttemptService.confirmManualPublish("qi_1");
    expect(res.alreadyPublished).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.publishLog.create).not.toHaveBeenCalled();
    expect(tx.publishedPost.create).not.toHaveBeenCalled();
    expect(tx.usageLog.create).not.toHaveBeenCalled();
  });

  it("transaction ortasında hata → tüm yazımlar aynı tx'te, yarım state dışarı sızmaz", async () => {
    mockItem(readyItem);
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(
      preparedAttempt() as Awaited<ReturnType<typeof prisma.publishAttempt.findFirst>>,
    );
    tx.publishedPost.create.mockRejectedValue(new Error("db down"));

    await expect(publishAttemptService.confirmManualPublish("qi_1")).rejects.toThrow("db down");
    // Yayın yazımlarının hiçbiri tx DIŞINDA yapılmadı → Prisma rollback bütünü geri alır.
    expect(prisma.publishLog.create).not.toHaveBeenCalled();
    expect(prisma.publishedPost.create).not.toHaveBeenCalled();
    expect(prisma.usageLog.create).not.toHaveBeenCalled();
    expect(prisma.queueItem.update).not.toHaveBeenCalled();
  });

  it("eşzamanlı ikinci onay (claim 0 satır) → kazanan yayınladıysa idempotent başarı", async () => {
    mockItem(readyItem);
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(
      preparedAttempt() as Awaited<ReturnType<typeof prisma.publishAttempt.findFirst>>,
    );
    tx.publishAttempt.updateMany.mockResolvedValue({ count: 0 });
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue(
      preparedAttempt({ state: "succeeded" }) as Awaited<
        ReturnType<typeof prisma.publishAttempt.findUnique>
      >,
    );
    vi.mocked(prisma.queueItem.findUnique)
      .mockResolvedValueOnce(readyItem as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>)
      .mockResolvedValueOnce({
        ...readyItem,
        status: "manual_published",
      } as unknown as Awaited<ReturnType<typeof prisma.queueItem.findUnique>>);

    const res = await publishAttemptService.confirmManualPublish("qi_1");
    expect(res.alreadyPublished).toBe(true);
    expect(tx.publishLog.create).not.toHaveBeenCalled();
  });
});

describe("latestIntentAttempts (reload persistence + stale işareti)", () => {
  it("prepared + aynı metin → staleForCurrentContent=false (reload sonrası korunur)", async () => {
    vi.mocked(prisma.publishAttempt.findMany).mockResolvedValue([
      preparedAttempt(),
    ] as Awaited<ReturnType<typeof prisma.publishAttempt.findMany>>);

    const map = await publishAttemptService.latestIntentAttempts([
      { id: "qi_1", content: READY_TEXT, editedContent: null, draftType: "TWEET", mode: "ai_news", threadSegments: null },
    ]);
    expect(map.get("qi_1")?.state).toBe("prepared");
    expect(map.get("qi_1")?.staleForCurrentContent).toBe(false);
  });

  it("içerik hazırlıktan sonra değişti → staleForCurrentContent=true", async () => {
    vi.mocked(prisma.publishAttempt.findMany).mockResolvedValue([
      preparedAttempt(),
    ] as Awaited<ReturnType<typeof prisma.publishAttempt.findMany>>);

    const map = await publishAttemptService.latestIntentAttempts([
      { id: "qi_1", content: READY_TEXT, editedContent: "Bambaşka bir metin.", draftType: "TWEET", mode: "ai_news", threadSegments: null },
    ]);
    expect(map.get("qi_1")?.staleForCurrentContent).toBe(true);
  });
});

describe("adapters", () => {
  it("XApiPublishAdapter ödeme izni yokken HTTP çağrısı YAPMAZ; typed blocked-external döner", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const input = {
      queueItemId: "qi_1",
      accountId: "acc_1",
      accountHandle: "grafikcem",
      text: READY_TEXT,
      contentHash: READY_HASH,
      idempotencyKey: "k",
      readinessSnapshot: {
        state: "ready" as const,
        reasons: [],
        policyVersion: "1.0.0-provisional",
        assessedAt: new Date().toISOString(),
      },
    };

    const prep = await xApiPublishAdapter.prepare(input);
    const pub = await xApiPublishAdapter.publish({ ...input, attemptId: "att_1" });

    expect(fetchSpy).not.toHaveBeenCalled();
    for (const res of [prep, pub]) {
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("payment_approval_required");
        expect(res.blockedExternal).toBe(true);
      }
    }
    fetchSpy.mockRestore();
  });

  it("IntentPublishAdapter intent URL üretir, otomatik publish reddeder", async () => {
    const input = {
      queueItemId: "qi_1",
      accountId: "acc_1",
      accountHandle: "grafikcem",
      text: "merhaba dünya",
      contentHash: contentHashOf("merhaba dünya"),
      idempotencyKey: "k",
      readinessSnapshot: {
        state: "ready" as const,
        reasons: [],
        policyVersion: "1.0.0-provisional",
        assessedAt: new Date().toISOString(),
      },
    };
    const prep = await intentPublishAdapter.prepare(input);
    expect(prep.ok).toBe(true);
    if (prep.ok) expect(prep.intentUrl).toBe(`https://x.com/intent/post?text=${encodeURIComponent("merhaba dünya")}`);

    const pub = await intentPublishAdapter.publish({ ...input, attemptId: "att_1" });
    expect(pub.ok).toBe(false);
  });
});


// ─── Phase 2D (ADR-033): dürüst thread intent + canonical segment hash ────────

const THREAD_SEGS = [
  { text: "Hook: bu araci kimse konusmuyor." },
  { text: "Adim 1: kurulum tek komut." },
  { text: "Adim 2: preset kilitle." },
  { text: "Payoff: kaydet, yarin lazim." },
];
const THREAD_JOINED = THREAD_SEGS.map((s) => s.text).join("\n\n");
const THREAD_HASH = contentHashOf(threadPublicationHashInput(THREAD_SEGS));

const threadItem = {
  ...readyItem,
  id: "qi_t",
  draftType: "THREAD",
  mode: "thread",
  content: THREAD_JOINED,
  threadSegments: JSON.stringify(THREAD_SEGS),
};

describe("canonicalPublicationOf (Phase 2D)", () => {
  it("thread: kind=thread_first_segment, intentText=YALNIZ ilk segment, text=birleşim, hash=segment hash'i", () => {
    const pub = canonicalPublicationOf(threadItem);
    expect(pub.kind).toBe("thread_first_segment");
    expect(pub.intentText).toBe(THREAD_SEGS[0].text);
    expect(pub.text).toBe(THREAD_JOINED);
    expect(pub.segmentCount).toBe(4);
    expect(pub.hash).toBe(THREAD_HASH);
    // Birleşik metnin düz hash'i DEĞİL — segment payload hash'i.
    expect(pub.hash).not.toBe(contentHashOf(THREAD_JOINED));
  });

  it("segment SIRASI değişince hash değişir (reorder → stale)", () => {
    const reordered = { ...threadItem, threadSegments: JSON.stringify([THREAD_SEGS[1], THREAD_SEGS[0], THREAD_SEGS[2], THREAD_SEGS[3]]) };
    expect(canonicalPublicationOf(reordered).hash).not.toBe(THREAD_HASH);
  });

  it("non-thread hash davranışı geriye uyumlu: contentHashOf(text)", () => {
    const pub = canonicalPublicationOf(readyItem);
    expect(pub.kind).toBe("single");
    expect(pub.segmentCount).toBe(1);
    expect(pub.hash).toBe(contentHashOf(READY_TEXT));
  });

  it("mode=thread + draftType=TWEET (tarihî sınıf) segmentliyse thread sayılır", () => {
    const pub = canonicalPublicationOf({ ...threadItem, draftType: "TWEET", mode: "thread" });
    expect(pub.kind).toBe("thread_first_segment");
  });
});

describe("prepareIntent — thread (Phase 2D)", () => {
  it("intent URL YALNIZ ilk segmenti taşır; birleşik thread tek intent'e GÖNDERİLMEZ; intentMode typed", async () => {
    mockItem(threadItem);
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue(null);
    tx.publishAttempt.create.mockImplementation(async (args: { data: Record<string, unknown> }) =>
      preparedAttempt({ ...args.data, id: "att_t" }),
    );

    const res = await publishAttemptService.prepareIntent("qi_t");
    expect(res.intentMode).toBe("thread_first_segment");
    expect(res.segmentCount).toBe(4);
    expect(res.intentUrl).toBe(`https://x.com/intent/post?text=${encodeURIComponent(THREAD_SEGS[0].text)}`);
    expect(res.intentUrl).not.toContain(encodeURIComponent("Adim 1"));
    expect(res.attempt.contentHash).toBe(THREAD_HASH);
  });
});

describe("confirmManualPublish — thread (Phase 2D)", () => {
  it("güncel segment hash'i eşleşir → UsageLog.tweetCount=segmentCount, PublishLog manualThread, content=birleşim", async () => {
    mockItem(threadItem);
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(
      preparedAttempt({ id: "att_t", queueItemId: "qi_t", contentHash: THREAD_HASH }) as never,
    );
    tx.queueItem.update.mockResolvedValue({ ...threadItem, status: "manual_published", publishedAt: new Date() });

    const res = await publishAttemptService.confirmManualPublish("qi_t");
    expect(res.alreadyPublished).toBe(false);
    expect(tx.usageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tweetCount: 4 }) }),
    );
    const logArgs = tx.publishLog.create.mock.calls[0][0] as { data: { payload: string; content: string } };
    expect(JSON.parse(logArgs.data.payload)).toMatchObject({ manualThread: true, segmentCount: 4 });
    expect(logArgs.data.content).toBe(THREAD_JOINED);
    const ppArgs = tx.publishedPost.create.mock.calls[0][0] as { data: { content: string } };
    expect(ppArgs.data.content).toBe(THREAD_JOINED);
  });

  it("segment değişmişse content_changed (eski hazırlık geçersiz)", async () => {
    const edited = { ...threadItem, threadSegments: JSON.stringify([...THREAD_SEGS, { text: "Yeni ek segment." }]) };
    mockItem(edited);
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(
      preparedAttempt({ id: "att_t", queueItemId: "qi_t", contentHash: THREAD_HASH }) as never,
    );
    await expectFlowError(publishAttemptService.confirmManualPublish("qi_t"), "content_changed");
    expect(tx.publishLog.create).not.toHaveBeenCalled();
  });

  it("non-thread confirm regresyonu: tweetCount=1, manualThread yok", async () => {
    mockItem(readyItem);
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue(preparedAttempt() as never);
    await publishAttemptService.confirmManualPublish("qi_1");
    expect(tx.usageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tweetCount: 1 }) }),
    );
    const logArgs = tx.publishLog.create.mock.calls[0][0] as { data: { payload: string } };
    expect(JSON.parse(logArgs.data.payload).manualThread).toBeUndefined();
  });
});

describe("latestIntentAttempts — thread stale (Phase 2D)", () => {
  it("segment düzenlendi/yeniden sıralandı → staleForCurrentContent=true", async () => {
    vi.mocked(prisma.publishAttempt.findMany).mockResolvedValue([
      preparedAttempt({ id: "att_t", queueItemId: "qi_t", contentHash: THREAD_HASH }),
    ] as Awaited<ReturnType<typeof prisma.publishAttempt.findMany>>);

    const reordered = JSON.stringify([THREAD_SEGS[1], THREAD_SEGS[0], THREAD_SEGS[2], THREAD_SEGS[3]]);
    const map = await publishAttemptService.latestIntentAttempts([
      { id: "qi_t", content: THREAD_JOINED, editedContent: null, draftType: "THREAD", mode: "thread", threadSegments: reordered },
    ]);
    expect(map.get("qi_t")?.staleForCurrentContent).toBe(true);
  });

  it("aynı segment payload'ı → stale değil", async () => {
    vi.mocked(prisma.publishAttempt.findMany).mockResolvedValue([
      preparedAttempt({ id: "att_t", queueItemId: "qi_t", contentHash: THREAD_HASH }),
    ] as Awaited<ReturnType<typeof prisma.publishAttempt.findMany>>);

    const map = await publishAttemptService.latestIntentAttempts([
      { id: "qi_t", content: THREAD_JOINED, editedContent: null, draftType: "THREAD", mode: "thread", threadSegments: JSON.stringify(THREAD_SEGS) },
    ]);
    expect(map.get("qi_t")?.staleForCurrentContent).toBe(false);
  });
});
