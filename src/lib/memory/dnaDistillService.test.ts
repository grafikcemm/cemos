import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyOpeningHook,
  computeLengthRange,
  computeEmojiPolicy,
  computeLineBreakPattern,
  rankOpeningHooks,
  extractHashtagFrequency,
  runDnaDistillation,
  MIN_EVIDENCE,
} from "./dnaDistillService";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    queueItem: { findMany: vi.fn() },
    trainingExample: { findMany: vi.fn() },
    captionDna: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    hashtagDna: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    seriesProfile: { findMany: vi.fn() },
  },
}));

describe("dnaDistillService — deterministik yardımcılar", () => {
  it("açılış kancasını sınıflandırır: soru / rakam / senli hitap / iddia", () => {
    expect(classifyOpeningHook("Bunu neden kimse konuşmuyor?")).toBe("soru");
    expect(classifyOpeningHook("3 araçla iş akışını hızlandır.")).toBe("rakam");
    expect(classifyOpeningHook("Sen hâlâ manuel mi yapıyorsun bunu")).toBe("senli_hitap");
    expect(classifyOpeningHook("Disiplin bir sistem işidir.")).toBe("iddia");
  });

  it("uzunluk aralığını min/max/medyan olarak hesaplar", () => {
    expect(computeLengthRange(["ab", "abcd", "abcdef"])).toEqual({ min: 2, max: 6, median: 4 });
    expect(computeLengthRange([])).toEqual({ min: 0, max: 0, median: 0 });
  });

  it("emoji politikası: yokluk=none, azlık=sparse, yaygınlık=free", () => {
    expect(computeEmojiPolicy(["düz metin", "yine düz"])).toBe("none");
    const sparse = [...Array(9).fill("düz metin"), "emoji var 🚀"];
    expect(computeEmojiPolicy(sparse)).toBe("sparse");
    expect(computeEmojiPolicy(["🚀 hep", "🔥 emoji"])).toBe("free");
  });

  it("satır düzeni: tek blok vs çok paragraf", () => {
    expect(computeLineBreakPattern(["tek satır metin"])).toBe("tek_blok");
    expect(computeLineBreakPattern(["a\n\nb\n\nc\n\nd"])).toBe("cok_paragraf");
  });

  it("kanca tiplerini frekansa göre sıralar", () => {
    const hooks = rankOpeningHooks(["Soru mu?", "Bu da soru mu?", "Düz iddia."]);
    expect(hooks[0]).toBe("soru");
    expect(hooks).toContain("iddia");
  });

  it("hashtag frekansını küçük harfe indirger ve sayar", () => {
    const freq = extractHashtagFrequency(["#AI harika #ai", "#Tasarım ve #ai"]);
    expect(freq.get("#ai")).toBe(3);
    expect(freq.get("#tasarım")).toBe(1);
  });
});

describe("runDnaDistillation — yazma disiplini", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: "acc-1" } as never);
    vi.mocked(prisma.seriesProfile.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.hashtagDna.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.captionDna.findUnique).mockResolvedValue(null as never);
  });

  it("korpus < MIN_EVIDENCE ise CaptionDna YAZILMAZ (fail-closed)", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([
      { content: "tek örnek", editedContent: null },
    ] as never);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([] as never);

    const out = await runDnaDistillation({ handles: ["grafikcem"] });

    expect(out[0].captionDna).toBe("skipped_low_evidence");
    expect(prisma.captionDna.create).not.toHaveBeenCalled();
    expect(prisma.captionDna.update).not.toHaveBeenCalled();
  });

  it("yeterli korpusla CaptionDna oluşturur: own_metric + yapısal istatistikler", async () => {
    const rows = Array.from({ length: MIN_EVIDENCE }, (_, i) => ({
      content: `Taslak metni numara ${i}. Sistem kurmak histen iyidir.`,
      editedContent: i % 2 === 0 ? `Düzenlenmiş metin ${i}? Kısa net.` : null,
    }));
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue(rows as never);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([] as never);

    const out = await runDnaDistillation({ handles: ["grafikcem"] });

    expect(out[0].captionDna).toBe("written");
    expect(prisma.captionDna.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountHandle: "grafikcem",
        provenance: "own_metric",
        evidenceCount: MIN_EVIDENCE,
      }),
    });
    const arg = vi.mocked(prisma.captionDna.create).mock.calls[0][0].data as unknown as Record<string, string>;
    expect(JSON.parse(arg.lengthRange)).toHaveProperty("median");
    expect(JSON.parse(arg.openingHookTypes).length).toBeGreaterThan(0);
  });

  it("operatör-tohumlu CaptionDna ASLA ezilmez (identity > own_metric)", async () => {
    const rows = Array.from({ length: MIN_EVIDENCE }, (_, i) => ({
      content: `Metin ${i} yeterince uzun bir taslak örneği.`,
      editedContent: null,
    }));
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue(rows as never);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.captionDna.findUnique).mockResolvedValue({
      version: 1,
      provenance: "operator",
    } as never);

    const out = await runDnaDistillation({ handles: ["grafikcem"] });

    expect(out[0].captionDna).toBe("skipped_operator_owned");
    expect(prisma.captionDna.update).not.toHaveBeenCalled();
    expect(prisma.captionDna.create).not.toHaveBeenCalled();
  });

  it("mevcut CaptionDna güncellenirken version artar", async () => {
    const rows = Array.from({ length: MIN_EVIDENCE }, (_, i) => ({
      content: `Metin ${i} yeterince uzun bir taslak örneği.`,
      editedContent: null,
    }));
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue(rows as never);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.captionDna.findUnique).mockResolvedValue({ version: 3 } as never);

    await runDnaDistillation({ handles: ["grafikcem"] });

    expect(prisma.captionDna.update).toHaveBeenCalledWith({
      where: { accountHandle: "grafikcem" },
      data: expect.objectContaining({ version: 4 }),
    });
  });

  it("korpusta hashtag yoksa hesap-seviyesi HashtagDna yazılmaz", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([
      { content: "hashtagsiz metin", editedContent: null },
    ] as never);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([] as never);

    const out = await runDnaDistillation({ handles: ["grafikcem"] });

    expect(out[0].hashtagDna).toBe("skipped_no_tags");
    expect(prisma.hashtagDna.create).not.toHaveBeenCalled();
  });

  it("SeriesProfile tohumundan seri-bazlı HashtagDna satırı üretir", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.seriesProfile.findMany).mockResolvedValue([
      { id: "series-1", hashtagDnaJson: '["#AI","#AiTools"]' },
    ] as never);

    const out = await runDnaDistillation({ handles: ["grafikcem"] });

    expect(out[0].seriesHashtagDna).toBe(1);
    expect(prisma.hashtagDna.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountHandle: "grafikcem",
        seriesId: "series-1",
        coreTags: JSON.stringify(["#ai", "#aitools"]),
      }),
    });
  });

  it("bir hesabın hatası diğerini durdurmaz (fail-open)", async () => {
    vi.mocked(prisma.account.findUnique)
      .mockRejectedValueOnce(new Error("db down") as never)
      .mockResolvedValueOnce({ id: "acc-2" } as never);
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.trainingExample.findMany).mockResolvedValue([] as never);

    const out = await runDnaDistillation({ handles: ["grafikcem", "maskulenkod"] });

    expect(out[0].error).toBe("db down");
    expect(out[1].error).toBeUndefined();
  });
});
