import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 4C-A intake contract: youtube idempotency (kind), manual/NotebookLM içerik-hash
 * dedup, NotebookLM provenance (server-set provider/basis/verified=false — İSTEMCİ
 * belirlemez), transcript-grounded DEĞİL, çok kısa reddi.
 */

const sourceUpsert = vi.fn();
const sourceUpdate = vi.fn();
const transcriptUpsert = vi.fn();
const jobUpsert = vi.fn();
const packFindUnique = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    learnSource: {
      upsert: (a: unknown) => sourceUpsert(a),
      update: (a: unknown) => sourceUpdate(a),
    },
    learnTranscript: { upsert: (a: unknown) => transcriptUpsert(a) },
    learnProcessingJob: { upsert: (a: unknown) => jobUpsert(a) },
    learnPack: { findUnique: (a: unknown) => packFindUnique(a) },
  },
}));

import {
  learnService,
  InvalidSourceInputError,
  InvalidSourceUrlError,
} from "./learnService";

type UpsertArg = { where: unknown; update: Record<string, unknown>; create: Record<string, unknown> };

beforeEach(() => {
  vi.clearAllMocks();
  sourceUpsert.mockImplementation((a: UpsertArg) =>
    Promise.resolve({ id: `src-${String(a.create.externalId).slice(0, 8)}`, ...a.create })
  );
  sourceUpdate.mockResolvedValue({});
  transcriptUpsert.mockResolvedValue({});
  jobUpsert.mockResolvedValue({ id: "job-1" });
  packFindUnique.mockResolvedValue(null);
});

describe("createSource — youtube", () => {
  it("videoId çıkarır, kind=youtube, manuel yoksa transcript yazmaz", async () => {
    const r = await learnService.createSource({ kind: "youtube", url: "https://youtu.be/abcdefghijk" });
    expect(r.videoId).toBe("abcdefghijk");
    expect((sourceUpsert.mock.calls[0][0] as UpsertArg).create.kind).toBe("youtube");
    expect(transcriptUpsert).not.toHaveBeenCalled();
  });

  it("geçersiz URL → InvalidSourceUrlError", async () => {
    await expect(
      learnService.createSource({ kind: "youtube", url: "bu url değil" })
    ).rejects.toBeInstanceOf(InvalidSourceUrlError);
  });
});

describe("createSource — manual_transcript", () => {
  it("aynı içerik → aynı externalId (SHA-256 idempotent), provider=manual (server)", async () => {
    const text = "Deterministik manuel transkript içeriği. ".repeat(20);
    await learnService.createSource({ kind: "manual_transcript", text });
    await learnService.createSource({ kind: "manual_transcript", text });
    const id0 = (sourceUpsert.mock.calls[0][0] as UpsertArg).create.externalId;
    const id1 = (sourceUpsert.mock.calls[1][0] as UpsertArg).create.externalId;
    expect(id0).toBe(id1);
    expect((sourceUpsert.mock.calls[0][0] as UpsertArg).create.kind).toBe("manual_transcript");
    expect((transcriptUpsert.mock.calls[0][0] as UpsertArg).create.provider).toBe("manual");
  });

  it("çok kısa → InvalidSourceInputError", async () => {
    await expect(
      learnService.createSource({ kind: "manual_transcript", text: "kısa" })
    ).rejects.toBeInstanceOf(InvalidSourceInputError);
  });
});

describe("createSource — notebooklm_summary", () => {
  it("provenance: basis=summary, provider=notebooklm, verified=false (server-set)", async () => {
    const summary = "NotebookLM özeti metni burada. ".repeat(20);
    await learnService.createSource({ kind: "notebooklm_summary", summary, sourceUrl: "https://x/y" });
    const create = (sourceUpsert.mock.calls[0][0] as UpsertArg).create;
    expect(create.kind).toBe("notebooklm_summary");
    const meta = JSON.parse(String(create.metaJson));
    expect(meta.basis).toBe("summary");
    expect(meta.provider).toBe("notebooklm");
    expect(meta.verified).toBe(false);
    // transcript provider NotebookLM (transcript-grounded DEĞİL, summary basis)
    expect((transcriptUpsert.mock.calls[0][0] as UpsertArg).create.provider).toBe("notebooklm");
  });

  it("içerik-hash dedup: aynı özet → aynı externalId", async () => {
    const summary = "Sabit özet metni tekrar tekrar. ".repeat(20);
    await learnService.createSource({ kind: "notebooklm_summary", summary });
    await learnService.createSource({ kind: "notebooklm_summary", summary });
    const id0 = (sourceUpsert.mock.calls[0][0] as UpsertArg).create.externalId;
    const id1 = (sourceUpsert.mock.calls[1][0] as UpsertArg).create.externalId;
    expect(id0).toBe(id1);
  });

  it("çok kısa özet → InvalidSourceInputError", async () => {
    await expect(
      learnService.createSource({ kind: "notebooklm_summary", summary: "kısa" })
    ).rejects.toBeInstanceOf(InvalidSourceInputError);
  });
});
